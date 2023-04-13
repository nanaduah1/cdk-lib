import os

import boto3
from auth.authorizer import NotAuthorizedException, TokenAuthorizer

app_name = os.getenv("AppName")
allowed_resources = os.getenv("AllowedEndpoints", "")
apiKey_parameter_name = boto3.client("ssm").get_parameter(
    Name=os.getenv("ApiKeyParameterName"),
    WithDecryption=True,
)

api_key_value = apiKey_parameter_name["Parameter"].get("Value")


def handler(event, context):
    authorizer = TokenAuthorizer(
        system_token=api_key_value,
        app_name=app_name,
        event=event,
    )

    try:
        policy_document = authorizer.authorize(allowed_resources.split(","))
        print(policy_document)
        return policy_document
    except NotAuthorizedException as ex:
        print(ex, " Event: ", event)
        return "AccessDenied"
