import pytest
from auth.authorizer import NotAuthorizedException, TokenAuthorizer


def test_missing_key_throws_unauthorized():
    tested = TokenAuthorizer(
        system_token="test",
        event={},
        app_name="test_app",
    )

    with pytest.raises(NotAuthorizedException):
        tested.authorize(["/api/test"])


def test_empty_key_throws_unauthorized():
    tested = TokenAuthorizer(
        system_token="test",
        event={"authorizationToken": ""},
        app_name="test_app",
    )

    with pytest.raises(NotAuthorizedException):
        tested.authorize(["/api/test"])


def test_mismatched_key_returns_deny():
    tested = TokenAuthorizer(
        system_token="test",
        event={"authorizationToken": "123"},
        app_name="test_app",
    )

    result = tested.authorize(["/api/test"])

    statement = result["policyDocument"]
    assert statement is not None
    assert result["principalId"] == "test_app"
    assert statement["Statement"][0]["Effect"] == "Deny"
    assert statement["Statement"][0]["Resource"] == "*"


def test_matched_key_returns_allow_for_resources():
    tested = TokenAuthorizer(
        system_token="test",
        event={
            "authorizationToken": "test",
            "methodArn": "arn:aws:api-test",
            "requestContext": {"httpMethod": "POST", "resourceId": "POST /api/test"},
        },
        app_name="test_app",
    )

    result = tested.authorize(["POST /api/test"])

    statement = result["policyDocument"]
    assert statement is not None
    assert result["principalId"] == "test_app"
    assert statement["Statement"][0]["Effect"] == "Allow"
    assert statement["Statement"][0]["Resource"] == "arn:aws:api-test"
