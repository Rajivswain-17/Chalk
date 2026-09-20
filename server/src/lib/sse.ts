import type { Response } from "express";
import type { SSEEvent } from "../types";

const HEARTBEAT_MS = 25_000;

class SSEManager {
  private clients = new Map<string, Set<Response>>();
  private heartbeats = new Map<string, NodeJS.Timeout>();
  private sequence = 0;

  addClient(jobId: string, response: Response): void {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    response.write(`: connected ${jobId}\n\n`);

    const clients = this.clients.get(jobId) ?? new Set<Response>();
    clients.add(response);
    this.clients.set(jobId, clients);

    if (!this.heartbeats.has(jobId)) {
      const timer = setInterval(() => {
        for (const client of this.clients.get(jobId) ?? []) {
          if (!client.writableEnded) client.write(": heartbeat\n\n");
        }
      }, HEARTBEAT_MS);
      timer.unref();
      this.heartbeats.set(jobId, timer);
    }

    response.once("close", () => this.removeClient(jobId, response));
  }

  /** Send a typed frame to one newly connected client or a full job audience. */
  send(response: Response, event: SSEEvent): void {
    if (response.writableEnded) return;
    this.sequence += 1;
    response.write(
      `id: ${this.sequence}\nevent: ${event.type.toLowerCase()}\ndata: ${JSON.stringify(event)}\n\n`,
    );
  }

  emit(jobId: string, event: SSEEvent): void {
    for (const client of this.clients.get(jobId) ?? []) this.send(client, event);
  }

  closeAll(): void {
    for (const clients of this.clients.values()) {
      for (const client of clients) client.end();
    }
    for (const timer of this.heartbeats.values()) clearInterval(timer);
    this.clients.clear();
    this.heartbeats.clear();
  }

  private removeClient(jobId: string, response: Response): void {
    const clients = this.clients.get(jobId);
    if (!clients) return;
    clients.delete(response);
    if (clients.size > 0) return;
    this.clients.delete(jobId);
    const timer = this.heartbeats.get(jobId);
    if (timer) clearInterval(timer);
    this.heartbeats.delete(jobId);
  }
}

export const sseManager = new SSEManager();
