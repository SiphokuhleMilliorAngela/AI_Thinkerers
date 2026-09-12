import { WebSocketServer } from 'ws'
import { systemTools } from './tools/systemTools.js'

const PORT = Number(process.env.TOOL_SERVER_PORT ?? 8787)
const server = new WebSocketServer({ port: PORT })

const tools = {
  ...systemTools,
}

server.on('connection', (socket) => {
  socket.on('message', async (raw) => {
    let request

    try {
      request = JSON.parse(raw.toString())
      const tool = tools[request.tool]

      if (!tool) {
        throw new Error(`Unknown tool: ${request.tool}`)
      }

      const result = await tool(request.args ?? {})
      socket.send(JSON.stringify({ id: request.id, ok: true, result }))
    } catch (error) {
      socket.send(
        JSON.stringify({
          id: request?.id,
          ok: false,
          error: error.message,
        }),
      )
    }
  })
})

console.log(`Agent tool server listening on ws://localhost:${PORT}`)
