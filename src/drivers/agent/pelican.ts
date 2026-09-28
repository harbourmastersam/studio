import { BaseDriver } from "../base-driver";
import CommonAgentDriverImplementation, { CommonAgentMessage } from "./common";

export type ManagedAgentQuery = (
  messages: CommonAgentMessage[]
) => Promise<string>;

export default class PelicanAgentDriver extends CommonAgentDriverImplementation {
  constructor(
    driver: BaseDriver,
    private readonly managedQuery: ManagedAgentQuery
  ) {
    super(driver);
  }

  query(messages: CommonAgentMessage[]): Promise<string> {
    return this.managedQuery(
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      }))
    );
  }
}
