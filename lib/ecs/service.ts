import {
  CloudMapOptions,
  Ec2Service,
  ICluster,
  TaskDefinition,
} from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";
import { ISecurityGroup } from "aws-cdk-lib/aws-ec2";
import { DnsRecordType, INamespace } from "aws-cdk-lib/aws-servicediscovery";

type EcsHttpApiServiceProps = {
  serviceName: string;
  cluster: ICluster;
  securityGroup: ISecurityGroup;
  taskDefinition: TaskDefinition;
  cloudMapNamespace?: INamespace;
  containerPort?: number;
};

export class EcsHttpApiService extends Construct {
  readonly service: Ec2Service;
  constructor(scope: Construct, id: string, props: EcsHttpApiServiceProps) {
    super(scope, id);
    const cloudMapOptions: CloudMapOptions = {
      name: props.serviceName,
      containerPort: props.containerPort,
      cloudMapNamespace:
        props.cloudMapNamespace ?? props.cluster.defaultCloudMapNamespace,
      dnsRecordType: DnsRecordType.SRV,
    };

    this.service = new Ec2Service(this, `Service-${id}`, {
      serviceName: props.serviceName,
      cluster: props.cluster,
      taskDefinition: props.taskDefinition,
      securityGroups: [props.securityGroup],
      cloudMapOptions: props.cloudMapNamespace ? cloudMapOptions : undefined,
    });
  }
}
