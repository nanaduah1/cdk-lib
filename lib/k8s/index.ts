import { Construct } from "constructs";
import { IClusterInitializer } from "./abstractions";
import {
  CfnKeyPair,
  IMachineImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { randomUUID } from "crypto";
import { AutoScalingGroup } from "aws-cdk-lib/aws-autoscaling";

type K8sClusterProps = {
  numberOfNodes?: number;
  instanceType?: InstanceType;
  vpc?: Vpc;
  machineImage?: IMachineImage;
  initializer?: IClusterInitializer;
};

export class K8sCluster extends Construct {
  readonly vpc: Vpc;
  readonly autoScalingGroup: AutoScalingGroup;
  readonly sshKey: CfnKeyPair;
  constructor(scope: Construct, id: string, props: K8sClusterProps) {
    super(scope, id);

    const { numberOfNodes, instanceType, vpc, machineImage, initializer } =
      props;

    const clusterVpc = vpc ?? new Vpc(this, `${id}-vpc`);
    const nodeCount = numberOfNodes ?? 1;
    const nodeType =
      instanceType ?? InstanceType.of(InstanceClass.T4G, InstanceSize.NANO);

    const imageToUse =
      machineImage ??
      MachineImage.genericLinux({ "us-east-1": "ami-0044130ca185d0880" });
    const sshKeyPair = new CfnKeyPair(this, "SSH-Key", {
      keyName: `${id}-ssh-key${randomUUID()}`,
    });

    const asg = new AutoScalingGroup(this, `${id}-asg`, {
      vpc: clusterVpc,
      instanceType: nodeType,
      machineImage: imageToUse,
      maxCapacity: nodeCount,
      keyName: sshKeyPair.keyName,
      init: initializer?.init(this),
    });

    this.vpc = clusterVpc;
    this.autoScalingGroup = asg;
    this.sshKey = sshKeyPair;
  }
}
