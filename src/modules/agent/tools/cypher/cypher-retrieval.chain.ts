import { BaseLanguageModel } from "langchain/base_language";
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { RunnablePassthrough } from "@langchain/core/runnables";
import initCypherGenerationChain from "./cypher-generation.chain";
import initCypherEvaluationChain from "./cypher-evaluation.chain";
import { saveHistory } from "../../history";
import { AgentToolInput } from "../../agent.types";
import { extractIds } from "../../../../utils";
import initGenerateAuthoritativeAnswerChain from "../../chains/authoritative-answer-generation.chain";

// tag::input[]
type CypherRetrievalThroughput = AgentToolInput & {
  context: string;
  output: string;
  cypher: string;
  results: Record<string, any> | Record<string, any>[];
  ids: string[];
};
// end::input[]

// tag::recursive[]
/**
 * Use database the schema to generate and subsequently validate
 * a Cypher statement based on the user question
 *
 * @param {Neo4jGraph}        graph     The graph
 * @param {BaseLanguageModel} llm       An LLM to generate the Cypher
 * @param {string}            question  The rephrased question
 * @returns {string}
 */
async function recursivelyEvaluate(
  graph: Neo4jGraph,
  llm: BaseLanguageModel,
  question: string
): Promise<string> {
  // TODO: Create Cypher Generation Chain
  // const generationChain = ...
  // TODO: Create Cypher Evaluation Chain
  // const evaluatorChain = ...

  // TODO: Generate Initial cypher
  console.log({ question });

  // TODO: Recursively evaluate the cypher until there are no errors

  // tag::chains[]
  // Initiate chains
  const generationChain = await initCypherGenerationChain(graph, llm);
  const evaluatorChain = await initCypherEvaluationChain(llm);
  // end::chains[]

  // tag::initialcypher[]
  // Generate Initial Cypher
  let cypher = await generationChain.invoke(question);
  // end::initialcypher[]

  console.log({ cypher });

  // tag::evaluateloop[]
  let errors = ["N/A"];
  let tries = 0;

  while (tries < 5 && errors.length > 0) {
    tries++;

    // Evaluate Cypher
    const evaluation = await evaluatorChain.invoke({
      question,
      schema: graph.getSchema(),
      cypher,
      errors,
    });

    errors = evaluation.errors;
    cypher = evaluation.cypher;

    console.log({ cypher, errors });
  }
  // end::evaluateloop[]

  // tag::evaluatereturn[]
  // Bug fix: GPT-4 is adamant that it should use id() regardless of
  // the instructions in the prompt.  As a quick fix, replace it here
  cypher = cypher.replace(/\sid\(([^)]+)\)/g, " elementId($1)");

  return cypher;
  // end::evaluatereturn[]
}
// end::recursive[]

// tag::function[]
export default async function initCypherRetrievalChain(
  llm: BaseLanguageModel,
  graph: Neo4jGraph
) {
  // tag::answerchain[]
  const answerGeneration = await initGenerateAuthoritativeAnswerChain(llm);
  // end::answerchain[]

  return (
    RunnablePassthrough

      // tag::cypher[]
      // Generate and evaluate the Cypher statement
      .assign({
        cypher: (input: { rephrasedQuestion: string }) =>
          recursivelyEvaluate(graph, llm, input.rephrasedQuestion),
      })
      // end::cypher[]

      // tag::getresults[]
      // Get results from database
      .assign({
        results: (input: { cypher: string }) => graph.query(input.cypher, {}),
      })
      // end::getresults[]

      // tag::extract[]
      // Extract information
      .assign({
        // Extract _id fields
        ids: (input: Omit<CypherRetrievalThroughput, "ids">) =>
          extractIds(input.results),
        // Convert results to JSON output
        context: ({ results }: Omit<CypherRetrievalThroughput, "ids">) =>
          Array.isArray(results) && results.length == 1
            ? JSON.stringify(results[0])
            : JSON.stringify(results),
      })
      // end::extract[]

      // tag::answer[]
      // Generate Output
      .assign({
        output: (input: CypherRetrievalThroughput) =>
          answerGeneration.invoke({
            question: input.rephrasedQuestion,
            context: input.context,
          }),
      })
      // end::answer[]

      // tag::save[]
      // Save response to database
      .assign({
        responseId: async (input: CypherRetrievalThroughput, options) => {
          console.log("mem", { input, options });

          saveHistory(
            options?.config.configurable.sessionId,
            input.input,
            input.rephrasedQuestion,
            input.output,
            input.ids,
            input.cypher
          );
        },
      })
      // end::save[]
      // tag::output[]
      // Return the output
      .pick("output")
  );
  // end::output[]
}
// end::function[]
