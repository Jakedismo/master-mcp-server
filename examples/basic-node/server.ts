import { createServer } from '../../src/index.js'

async function main() {
  await createServer(true)
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main()

