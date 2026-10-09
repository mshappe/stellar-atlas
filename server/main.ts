import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApiServer } from './api'
import { loadServerConfig } from './config'
import { openLabelStore, parseLabelSeeds } from './label-store'
import { openSourceIndex } from './source-index'

const config = loadServerConfig()
const seeds = parseLabelSeeds(JSON.parse(readFileSync('public/prominent-star-labels.provenance.json', 'utf8')))
const labelStore = openLabelStore(config.databasePath, seeds)
const sourceIndex = openSourceIndex(config.sourceIndexPath)
const server = createApiServer({ ...config, labelStore, sourceIndex, staticDirectory: resolve('dist') })

server.listen(config.port, () => {
  console.log(`Stellar Atlas API listening on ${config.publicOrigin}`)
})

process.on('SIGTERM', () => {
  server.close(() => {
    labelStore.close()
    sourceIndex.close()
  })
})
