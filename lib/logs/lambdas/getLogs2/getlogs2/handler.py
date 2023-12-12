from decimal import Decimal
import boto3
import os
import json
from cloudlydb.core.dynamodb import QueryTableCommand

database_table = boto3.resource("dynamodb").Table(os.getenv("DatabaseTableName"))


def handler(event, context):
    client_id = event.get("pathParameters", {}).get("clientId")
    event_type = event.get("queryStringParameters", {}).get("eventType", "error")

    if not client_id:
        return error(400, "Missing clientId!")

    try:
        logs = (
            QueryTableCommand(
                database_table=database_table,
                max_records=50,
            )
            .with_pk(client_id)
            .sk_beginswith(f"LOGS#{event_type}")
            .execute()
        )

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(list(logs), cls=DecimalEncoder),
        }
    except Exception as ex:
        print(ex)
        return error(500, "Something went wrong on the server")


def error(status, message):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": message}),
    }


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return json.JSONEncoder.default(self, obj)
