import { Construct } from "constructs";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Duration } from "aws-cdk-lib";
import { FunctionConfig } from "../types";
import { PythonFunctionV2 } from "../lambda/python";
import { BaseApp } from "../common";

type CronJobProps = {
  /**
   * The schedule or rate (frequency) that determines when CloudWatch Events in seconds.
   */
  schedule: number;

  /**
   * The path to the root folder of the lambda function.
   * It should be relative to the bin folder.
   */
  functions: string[] | { [key: string]: FunctionConfig }[];
} & FunctionConfig;

export class CronJobs extends Construct {
  private readonly functionsMap: {
    [index: string | number]: PythonFunctionV2;
  } = {};

  constructor(app: BaseApp, id: string, props: CronJobProps) {
    super(app, id);

    const { schedule, functions, ...selfConfig } = props;

    const jobFunctions = functions.map((func, index) => {
      const path = typeof func === "string" ? func : Object.keys(func)[0];
      const functionConfig = typeof func === "string" ? {} : func[path];

      // Merge the function config with the base app config
      const mergedFunctionConfig = {
        ...app.functions,
        ...selfConfig,
        ...functionConfig,
      };

      const jobFunction = new PythonFunctionV2(
        this,
        `${mergedFunctionConfig.name ?? index}-CronHandler-${id}`,
        {
          path,
          ...mergedFunctionConfig,
        }
      );

      // Add the function to the app
      this.functionsMap[index] = jobFunction;
      if (mergedFunctionConfig.name)
        this.functionsMap[mergedFunctionConfig.name] = jobFunction;

      return jobFunction;
    });

    // Create the cron job
    new Rule(this, "CronJobRule", {
      targets: jobFunctions.map((j) => new LambdaFunction(j)),
      schedule: Schedule.rate(Duration.seconds(schedule)),
    });
  }

  /**
   * Get a function by index or name. The index is the order in which the functions were added
   * in the functions array.
   */
  get(index: number | string) {
    return this.functionsMap[index];
  }
}
