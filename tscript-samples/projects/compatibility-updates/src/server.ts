import { createServer } from 'http';

const PORT: number = 4000;

const server = createServer((_req: any, res: { writeHead: (arg0: number, arg1: { "Content-Type": string; }) => void; end: (arg0: string) => void; }) => {
  res.writeHead(200,{"Content-Type": "text/plain"});
  res.end('TypeScript + Modern JS = ??');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
