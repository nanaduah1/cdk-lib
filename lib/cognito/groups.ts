import { CfnUserPoolGroup, UserPool } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

type UserGroupsProps = {
  groups: { name: string; description?: string }[];
  userPool: UserPool;
};

export class UserGroups {
  constructor(scope: Construct, props: UserGroupsProps) {
    if (props.groups) {
      props.groups.map((g) => {
        new CfnUserPoolGroup(scope, g.name, {
          userPoolId: props.userPool.userPoolId,
          groupName: g.name,
          description: g.description,
        });
      });
    }
  }
}
