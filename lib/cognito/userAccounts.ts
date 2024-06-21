import { Construct } from "constructs";
import {
  AwsCustomResource,
  PhysicalResourceId,
  AwsCustomResourcePolicy,
} from "aws-cdk-lib/custom-resources";
import { IUserPool } from "aws-cdk-lib/aws-cognito";
import { CfnUserPoolUserToGroupAttachment } from "aws-cdk-lib/aws-cognito";

type UserAccount = {
  username: string;
  password: string;
  groups?: string[];
  customAttributes?: { [attribute: string]: string };
};

type UserAccountProps = {
  users: UserAccount[];
  userPool: IUserPool;
  installLatestAwsSdk?: boolean;
};

export class UserAccounts {
  constructor(scope: Construct, props: UserAccountProps) {
    const { users, userPool } = props;

    users.forEach((user) => {
      const { username, password } = user;
      const userAttributes: any[] = [];

      if (user.customAttributes) {
        for (const attr in user.customAttributes) {
          userAttributes.push({
            Name: attr,
            Value: user.customAttributes[attr],
          });
        }
      }

      const createUser = new AwsCustomResource(
        scope,
        `create-user-${user.username}`,
        {
          onCreate: {
            service: "CognitoIdentityServiceProvider",
            action: "adminCreateUser",
            parameters: {
              UserPoolId: userPool.userPoolId,
              Username: username,
              MessageAction: "SUPPRESS",
              TemporaryPassword: password,
              UserAttributes: userAttributes,
            },
            physicalResourceId: PhysicalResourceId.of(
              `AwsCustomResource-CreateUser-${username}`
            ),
          },
          policy: AwsCustomResourcePolicy.fromSdkCalls({
            resources: AwsCustomResourcePolicy.ANY_RESOURCE,
          }),
          installLatestAwsSdk: props.installLatestAwsSdk ?? true,
        }
      );

      const adminSetUserPassword = new AwsCustomResource(
        scope,
        `create-user-${user.username}-set-password`,
        {
          onCreate: {
            service: "CognitoIdentityServiceProvider",
            action: "adminSetUserPassword",
            parameters: {
              UserPoolId: userPool.userPoolId,
              Username: username,
              Password: password,
              Permanent: true,
            },
            physicalResourceId: PhysicalResourceId.of(
              `AwsCustomResource-ForcePassword-${username}`
            ),
          },
          policy: AwsCustomResourcePolicy.fromSdkCalls({
            resources: AwsCustomResourcePolicy.ANY_RESOURCE,
          }),
          installLatestAwsSdk: props.installLatestAwsSdk ?? true,
        }
      );
      adminSetUserPassword.node.addDependency(createUser);

      if (user.groups) {
        user.groups.forEach((group) => {
          const userToAdminsGroupAttachment =
            new CfnUserPoolUserToGroupAttachment(
              scope,
              `AttachToGroup-${group}-${username}`,
              {
                userPoolId: userPool.userPoolId,
                groupName: group,
                username: username,
              }
            );
          userToAdminsGroupAttachment.node.addDependency(createUser);
          userToAdminsGroupAttachment.node.addDependency(adminSetUserPassword);
          userToAdminsGroupAttachment.node.addDependency(userPool);
        });
      }
    });
  }
}
