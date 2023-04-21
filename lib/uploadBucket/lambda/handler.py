from datetime import datetime
import json
import os

import boto3

s3 = boto3.client("s3")

REQUEST_MAPPING = {
    "GET": lambda fileName: generate_read_url(fileName),
    "PUT": lambda fileName: generate_upload_url(fileName),
    "OPTIONS": lambda *args: success("", ""),
}
BucketName = os.getenv("BucketName")


def handler(event, context):
    httpMethod = event["requestContext"]["http"]["method"].upper()
    fileName = event.get("queryStringParameters", {}).get("fileName", "")

    if not fileName:
        return error(message="fileName missing")

    try:
        handlerMethod = REQUEST_MAPPING[httpMethod]
        return handlerMethod(fileName)
    except KeyError:
        return error(404, "Not found")


def generate_read_url(fileName):
    signedUrl = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BucketName,
            "Key": fileName,
        },
        ExpiresIn=3600,
    )

    return success(fileName, signedUrl)


def generate_upload_url(fileName):
    uniqueFilename = generateUniqueFileName(fileName)
    signedUrl = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BucketName,
            "Key": uniqueFilename,
            "ContentType": "application/octet-stream",
        },
        ExpiresIn=60,
    )

    return success(uniqueFilename, signedUrl)


def generateUniqueFileName(fileKey: str):
    [*name_parts, extension] = fileKey.split(".")
    fileName = f"{'-'.join(name_parts)}-{datetime.utcnow().timestamp()}.{extension}"
    return fileName.replace(" ", "-")


def success(fileKey, signedUrl):
    return {
        "statusCode": 200,
        "Content-Type": "application/json",
        "body": json.dumps({"fileKey": fileKey, "signedUrl": signedUrl})
        if fileKey or signedUrl
        else "",
    }


def error(statusCode=400, message="Invalid inputs"):
    return {
        "statusCode": statusCode,
        "Content-Type": "application/json",
        "body": json.dumps({"message": message}),
    }
