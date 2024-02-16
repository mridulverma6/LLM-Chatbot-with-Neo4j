import { BaseLanguageModel } from "langchain/base_language";
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { PromptTemplate } from "@langchain/core/prompts";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import {
  JsonOutputParser,
  StringOutputParser,
} from "@langchain/core/output_parsers";

// tag::interface[]
export interface CypherEvaluationChainInput {
  question: string;
  cypher: string;
  schema: string;
  errors: string[];
}
// end::interface[]

// tag::output[]
export interface CypherEvaluationChainOutput {
  cypher: string;
  errors: string[];
}
// end::output[]

// tag::function[]
export default async function initCypherEvaluationChain(
  llm: BaseLanguageModel
) {
  // tag::prompt[]
  const prompt = PromptTemplate.fromTemplate(`
    Given the following schema, will the Cypher statement provided
    return the correct information to answer the question.

    If the statement is correct, return the statement.
    If the statement is incorrect, rewrite the statement.

    Return a JSON object with keys for "cypher" and "errors".
    - "cypher" - the corrected cypher statement
    - "corrected" - a boolean
    - "errors" - A list of uncorrectable errors.  For example, if a label,
        relationship type or property does not exist in the schema.
        Provide a hint to the correct element where possible.

    Example output:
    {{
      "cypher" : "MATCH (p:Person)<-[:DIRECTED_BY]-(m:Movie) RETURN p.personName AS name"
      "corrected": "false",
      "errors": [
        "The relationship type DIRECTED_BY does not exist in the schema.  Use (:Person)-[:DIRECTED]->(:Movie)",
        "The property :Person.personName does not exist in the schema.  Use person.name",
      ]
    }}

    Do not provide any preamble or markdown.

    Schema:
    {schema}

    Question:
    {question}

    Cypher Statement:
    {cypher}

    Errors:
    {errors}
  `);
  // end::prompt[]

  // tag::runnable[]
  // tag::startsequence[]
  return RunnableSequence.from<Record<string, any>, Record<string, any>>([
    // end::startsequence[]
    // tag::assign[]
    RunnablePassthrough.assign({
      // Convert array of strings into single string
      errors: ({ errors }) =>
        Array.isArray(errors) ? errors?.join("\n") : errors,
    }),
    // end::assign[]
    // tag::rest[]
    prompt,
    llm,
    new JsonOutputParser(),
    // end::rest[]
    // tag::endsequence[]
  ]);
  // end::endsequence[]
}
// end::function[]
