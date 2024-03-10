import { Stack } from "aws-cdk-lib";
import { ISecurityGroup } from "aws-cdk-lib/aws-ec2";
import {
  Compatibility,
  ContainerImage,
  Ec2Service,
  ICluster,
  NetworkMode,
  TaskDefinition,
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

type LoadBalancerProps = {
  name: string;
  cluster: ICluster;
  securityGroup: ISecurityGroup;
  /** Defaults to traefik:v2.11 */
  traefikImage?: string;
  enableAccessLog?: boolean;
  /** Defaults to EC2 */
  compatibility?: Compatibility;
  /** Defaults to 256 */
  cpu?: string;
  /** Defaults to 512 */
  memoryMiB?: string;
  /** Defaults to AWS_VPC */
  networkMode?: NetworkMode;
};

export class TraefikLoadBalancerForECS extends Construct {
  readonly cluster: ICluster;
  readonly service: Ec2Service;
  readonly httpApi: HttpApi;
  readonly vpcLink: IVpcLink;
  constructor(scope: Construct, id: string, props: LoadBalancerProps) {
    super(scope, id);

    const { cluster, name } = props;
    const taskId = `Task-${name}-${id}`;
    const taskDefinition = new TaskDefinition(this, taskId, {
      compatibility: props.compatibility ?? Compatibility.EC2,
      cpu: props.cpu ?? "256",
      memoryMiB: props.memoryMiB ?? "512",
      networkMode: props.networkMode ?? NetworkMode.AWS_VPC,
    });

    const region = Stack.of(this).region;
    const imageName = props.traefikImage ?? "traefik:v2.11";
    taskDefinition.addContainer("Traefik-" + name, {
      image: ContainerImage.fromRegistry(imageName),
      command: [
        "--api.dashboard=true",
        "--api.insecure=true",
        "--accesslog=true",
        "--providers.ecs.ecsAnywhere=true",
        `--providers.ecs.region=${region}`,
        "--providers.ecs.autoDiscoverClusters=true",
        "--providers.ecs.exposedByDefault=true",
      ],
      portMappings: [{ containerPort: 80 }, { containerPort: 8080 }],
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

    if (props.enableAccessLog) {
      this.addAccessLog(httpApi);
    }

    this.cluster = cluster;
    this.service = service;
    this.httpApi = httpApi;
    this.vpcLink = vpcLink;
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
}
