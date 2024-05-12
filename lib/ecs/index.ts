import { Stack } from "aws-cdk-lib";
import { ISecurityGroup } from "aws-cdk-lib/aws-ec2";
import {
  Compatibility,
  ContainerImage,
  Ec2Service,
  ICluster,
  NetworkMode,
  TaskDefinition,
  AwsLogDriver,
} from "aws-cdk-lib/aws-ecs";
import {
  Effect,
  IRole,
  PolicyStatement,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { DnsRecordType } from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpServiceDiscoveryIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { IVpcLink } from "aws-cdk-lib/aws-apigateway";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import { mkdirSync, writeFileSync } from "fs";
import * as yaml from "yaml";

type TraefikConfig = {
  /** Defaults to traefik:v2.11 */
  traefikImageVersion?: string;
  /**
   * Traefik configuration written as JSON object.
   * A minimal configuration is provided by default that enables the ECS provider and the dashboard.
   * You can override this configuration by providing your own JSON object.
   * You must allow your IP/IP range in dashboardAccessIps if you want to access the dashboard.
   * https://doc.traefik.io/traefik/reference/static-configuration/file/
   */
  config?: any;
};

type TraefikLoadBalancerProps = {
  name: string;
  cluster: ICluster;
  securityGroup: ISecurityGroup;
  enableHttpApiGatewayAccessLog?: boolean;
  /** Defaults to EC2 */
  compatibility?: Compatibility;
  /** Defaults to 256 */
  cpu?: string;
  /** Defaults to 512 */
  memoryMiB?: string;
  /** Defaults to AWS_VPC */
  networkMode?: NetworkMode;
  traefik: TraefikConfig;
  logEnabled?: boolean;
  logRetention?: RetentionDays;
  dockerLabels?: { [key: string]: string };
};

export class TraefikLoadBalancerForECS extends Construct {
  readonly cluster: ICluster;
  readonly service: Ec2Service;
  readonly httpApi: HttpApi;
  readonly vpcLink: IVpcLink;
  constructor(scope: Construct, id: string, props: TraefikLoadBalancerProps) {
    super(scope, id);

    const { cluster, name } = props;
    const taskId = `Task-${name}-${id}`;
    const taskDefinition = new TaskDefinition(this, taskId, {
      compatibility: props.compatibility ?? Compatibility.EC2,
      cpu: props.cpu ?? "256",
      memoryMiB: props.memoryMiB ?? "512",
      networkMode: props.networkMode ?? NetworkMode.AWS_VPC,
    });

    const containerImage = this.buildTraefikImage(props.traefik);

    let logging = undefined;
    if (props.logEnabled) {
      logging = new AwsLogDriver({
        streamPrefix: "buyit-db",
        logRetention: props.logRetention,
      });
    }
    taskDefinition.addContainer("Traefik-" + name, {
      image: containerImage,
      portMappings: [{ containerPort: 80 }, { containerPort: 8080 }],
      logging,
      dockerLabels: props.dockerLabels,
    });

    this.grantTraefikRequiredPermissions(taskDefinition.taskRole);
    const service = new Ec2Service(this, `Service-${name}-${id}`, {
      serviceName: `traefik-${name}`,
      cluster,
      taskDefinition,
      securityGroups: [props.securityGroup],
      cloudMapOptions: {
        name: `traefik-${name}`,
        containerPort: 8080,
        cloudMapNamespace: props.cluster.defaultCloudMapNamespace,
        dnsRecordType: DnsRecordType.SRV,
      },
    });

    const httpApi = new HttpApi(this, "HttpApi", {
      description: "Traefik Proxy for " + name,
    });

    const vpcLink = httpApi.addVpcLink({
      vpc: cluster.vpc,
      subnets: { subnets: cluster.vpc.privateSubnets },
    });

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [HttpMethod.ANY],
      integration: new HttpServiceDiscoveryIntegration(
        "Proxy-Integration" + name + "-HttpApi",
        service.cloudMapService!,
        {
          vpcLink,
        }
      ),
    });

    if (props.enableHttpApiGatewayAccessLog) {
      this.addAccessLog(httpApi);
    }

    this.cluster = cluster;
    this.service = service;
    this.httpApi = httpApi;
    this.vpcLink = vpcLink;
  }

  private buildTraefikImage(
    traefik: TraefikConfig,
    dir: string = "./.builld/traefik"
  ) {
    const imageName = traefik.traefikImageVersion ?? "traefik:v2.11";
    const meregedConfig = {
      ...this.staticConfig(traefik),
      ...(traefik.config ?? {}),
    };

    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "/traefik.yml", yaml.stringify(meregedConfig));
    writeFileSync(
      dir + "/Dockerfile",
      `FROM ${imageName}
      COPY traefik.yml /etc/traefik/traefik.yml
      `
    );
    return ContainerImage.fromAsset(dir);
  }

  private addAccessLog(httpApi: HttpApi) {
    const logGroup = new LogGroup(this, "HttpApiLogGroup" + httpApi.httpApiId, {
      logGroupName: `/aws/httpApi/${httpApi.httpApiId}`,
      retention: RetentionDays.ONE_DAY,
    });

    logGroup.grantWrite(new ServicePrincipal("apigateway.amazonaws.com"));

    const stage = httpApi.defaultStage!.node.defaultChild as CfnStage;
    stage.accessLogSettings = {
      destinationArn: logGroup.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        userAgent: "$context.identity.userAgent",
        sourceIp: "$context.identity.sourceIp",
        requestTime: "$context.requestTime",
        httpMethod: "$context.httpMethod",
        path: "$context.path",
        status: "$context.status",
        responseLength: "$context.responseLength",
      }),
    };
  }

  private grantTraefikRequiredPermissions(role: IRole) {
    role.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "ecs:ListClusters",
          "ecs:DescribeClusters",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:DescribeContainerInstances",
          "ecs:DescribeTaskDefinition",
          "ec2:DescribeInstances",
          //   "ssm:DescribeInstanceInformation",
        ],
        resources: ["*"],
      })
    );
  }

  private staticConfig(props: TraefikConfig) {
    const region = Stack.of(this).region;
    return {
      global: {
        checkNewVersion: true,
        sendAnonymousUsage: true,
      },
      providers: {
        ecs: {
          ecsAnywhere: true,
          region: region,
          autoDiscoverClusters: true,
          exposedByDefault: true,
        },
      },
      api: {
        dashboard: true,
        insecure: false,
      },
    };
  }
}
