import boto3
import os
import json
from cloudlydb.core.dynamodb import PutItemCommand

database_table = boto3.resource("dynamodb").Table(os.getenv("DatabaseTableName"))


def handler(event, context):
    records = (json.loads(e["body"]) for e in event.get("Records", []))
    for record in records:
        PutItemCommand(
            database_table=database_table,
            data=record,
            key={
                "pk": record.get("clientId"),
                "sk": f"LOGS#{record['eventType']}#{record['timestamp']}",
            },
        ).execute()
