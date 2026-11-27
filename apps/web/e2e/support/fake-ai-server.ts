import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const NOTE_TEXT = "O Raft elege um líder por mandato.";
export const SOURCE_TEXT =
  "No Raft, o líder recebe as entradas dos clientes e replica o log para os seguidores.";

interface ChatRequest {
  messages?: Array<{ role: string; content: string }>;
}

function answerFor(system: string): unknown {
  if (system.includes("Lacunas (até")) {
    return {
      clozes: [{ blockId: "b1", quote: "líder" }],
      questions: [
        {
          blockId: "b1",
          quote: "elege um líder por mandato",
          text: "Quem o Raft elege a cada mandato?",
          answer: "Um líder.",
        },
      ],
    };
  }
  if (system.includes("exercícios de prática")) {
    return {
      items: [
        {
          kind: "quiz",
          prompt: "Quem replica o log para os seguidores no Raft?",
          answer: "O líder.",
          sourceChunkId: "c1",
        },
      ],
    };
  }
  if (system.includes("pergunta sobre o próprio caderno")) {
    return { answer: "O líder replica o log para os seguidores.", citations: ["t1", "n1"] };
  }
  return {};
}

export interface FakeAi {
  url: string;
  features: string[];
  close: () => Promise<void>;
}

export async function startFakeAi(): Promise<FakeAi> {
  const features: string[] = [];
  const server: Server = createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")));
    req.on("end", () => {
      const parsed = JSON.parse(body) as ChatRequest;
      const system = parsed.messages?.find((message) => message.role === "system")?.content ?? "";
      const answer = answerFor(system);
      features.push(Object.keys(answer as object).join("+") || "unknown");
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    features,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
