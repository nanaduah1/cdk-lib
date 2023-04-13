from dataclasses import dataclass
from typing import List


class NotAuthorizedException(Exception):
    pass


@dataclass
class TokenAuthorizer:
    system_token: str
    app_name: str
    event: dict

    def authorize(self, allowed_resources: List[str]):
        access_token = self.event.get("authorizationToken")
        policy = self._policy(resource_name="*", effect="Deny")

        if not access_token:
            raise NotAuthorizedException()

        if access_token == self.system_token:
            resource = self.event["methodArn"]
            request_context = self.event["requestContext"]
            resource_id = request_context["resourceId"]

            # IMPORTANT: Allow only if the requested resource is
            # in the allowed_resources list
            if resource_id in allowed_resources:
                policy = self._policy(resource_name=resource, effect="Allow")

        return policy

    def _policy(self, resource_name: str, effect: str = "Deny"):
        return {
            "principalId": self.app_name,
            "policyDocument": {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Action": "execute-api:Invoke",
                        "Effect": effect,
                        "Resource": resource_name,
                    }
                ],
            },
        }
