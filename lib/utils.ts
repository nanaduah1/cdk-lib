const typeKeyMap = {
  [typeof 0.56]: "N",
  [typeof 1]: "N",
  [typeof ""]: "S",
  [typeof true]: "BOOL",
  [typeof {}]: "M",
};

export function toDynamoJson(obj: any): any {
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (let key in obj) {
      const val = obj[key];
      const dynamodbTypeKey = typeKeyMap[typeof val];
      const dynamoValue =
        typeof val === "object"
          ? toDynamoJson(val)
          : typeof val === "boolean"
          ? val
          : val.toString();
      result[key] = { [dynamodbTypeKey]: dynamoValue };
    }

    return result;
  }
}
