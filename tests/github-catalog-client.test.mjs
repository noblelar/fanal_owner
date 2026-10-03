import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'

import {
  downloadArtifactArchive,
  GitHubCatalogRequestError,
  githubJsonRequest,
  listWorkflowRunArtifacts,
} from '../app/utils/github-catalog-client.server.js'

const repository = 'noblelar/fanal_owner'
const requestHeaders = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'fanal-owner-release-catalog',
  'X-GitHub-Api-Version': '2022-11-28',
}

test('loads artifacts from the exact workflow run instead of a repository-wide artifact window', async () => {
  const calls = []
  const artifacts = [
    {
      id: 91,
      name: 'component-release-owner-123456789-1',
      expired: false,
    },
  ]
  const fetchImpl = async (url, init) => {
    calls.push({ init, url })
    return Response.json({ artifacts, total_count: 1 })
  }

  const result = await listWorkflowRunArtifacts(
    repository,
    123456789,
    'installation-token',
    requestHeaders,
    { fetchImpl }
  )

  assert.deepEqual(result, artifacts)
  assert.equal(calls.length, 1)
  assert.match(
    calls[0].url,
    /\/repos\/noblelar\/fanal_owner\/actions\/runs\/123456789\/artifacts\?/
  )
  assert.equal(calls[0].init.headers.Authorization, 'Bearer installation-token')
})

test('follows the signed artifact redirect without forwarding GitHub authorization', async () => {
  const archive = zipSync({
    'component-release.json': strToU8(JSON.stringify({ schema_version: 1 })),
  })
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ init, url })
    if (calls.length === 1) {
      return new Response(null, {
        headers: { Location: 'https://artifact-storage.example.test/download?signature=secret' },
        status: 302,
      })
    }
    return new Response(archive, {
      headers: { 'Content-Length': String(archive.byteLength) },
      status: 200,
    })
  }

  const result = await downloadArtifactArchive(
    repository,
    91,
    'installation-token',
    requestHeaders,
    { fetchImpl }
  )

  assert.deepEqual(result, archive)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].init.redirect, 'manual')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer installation-token')
  assert.equal(calls[1].init.redirect, 'error')
  assert.equal(calls[1].init.headers.Authorization, undefined)
  assert.deepEqual(Object.keys(calls[1].init.headers).sort(), ['Accept', 'User-Agent'])
})

test('classifies expired artifacts separately from metadata validation', async () => {
  const fetchImpl = async () => new Response(null, { status: 410 })

  await assert.rejects(
    downloadArtifactArchive(repository, 91, 'installation-token', requestHeaders, {
      fetchImpl,
    }),
    (error) =>
      error instanceof GitHubCatalogRequestError &&
      error.code === 'github_artifact_expired' &&
      error.status === 410
  )
})

test('classifies GitHub App permission failures without exposing credentials', async () => {
  const fetchImpl = async () => new Response(null, { status: 403 })

  await assert.rejects(
    downloadArtifactArchive(repository, 91, 'installation-token', requestHeaders, {
      fetchImpl,
    }),
    (error) =>
      error instanceof GitHubCatalogRequestError &&
      error.code === 'github_actions_read_forbidden' &&
      !error.message.includes('installation-token')
  )
})

test('rejects a successful storage response that is not a ZIP archive', async () => {
  let call = 0
  const fetchImpl = async () => {
    call += 1
    return call === 1
      ? new Response(null, {
          headers: { Location: 'https://artifact-storage.example.test/download' },
          status: 302,
        })
      : new Response('<html>not an artifact</html>', { status: 200 })
  }

  await assert.rejects(
    downloadArtifactArchive(repository, 91, 'installation-token', requestHeaders, {
      fetchImpl,
    }),
    (error) =>
      error instanceof GitHubCatalogRequestError && error.code === 'artifact_response_not_zip'
  )
})

test('rejects missing, malformed, or insecure download redirects', async () => {
  for (const location of [null, 'not a URL', 'http://artifact-storage.example.test/download']) {
    const fetchImpl = async () =>
      new Response(null, {
        headers: location ? { Location: location } : undefined,
        status: 302,
      })

    await assert.rejects(
      downloadArtifactArchive(repository, 91, 'installation-token', requestHeaders, {
        fetchImpl,
      }),
      (error) =>
        error instanceof GitHubCatalogRequestError && error.code === 'artifact_redirect_invalid'
    )
  }
})

test('rejects oversized artifacts before parsing their metadata', async () => {
  let call = 0
  const fetchImpl = async () => {
    call += 1
    return call === 1
      ? new Response(null, {
          headers: { Location: 'https://artifact-storage.example.test/download' },
          status: 302,
        })
      : new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
          headers: { 'Content-Length': String(2 * 1024 * 1024 + 1) },
          status: 200,
        })
  }

  await assert.rejects(
    downloadArtifactArchive(repository, 91, 'installation-token', requestHeaders, {
      fetchImpl,
    }),
    (error) =>
      error instanceof GitHubCatalogRequestError && error.code === 'artifact_archive_too_large'
  )
})

test('classifies malformed GitHub JSON as a catalog response error', async () => {
  const fetchImpl = async () =>
    new Response('not-json', {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  await assert.rejects(
    githubJsonRequest('/repos/noblelar/fanal_owner/actions/runs', 'token', requestHeaders, {
      fetchImpl,
    }),
    (error) =>
      error instanceof GitHubCatalogRequestError &&
      error.code === 'github_response_json_invalid'
  )
})

test('classifies network failures without leaking the requested signed URL', async () => {
  const fetchImpl = async () => {
    throw new Error('socket unavailable')
  }

  await assert.rejects(
    githubJsonRequest('/repos/noblelar/fanal_owner/actions/runs', 'token', requestHeaders, {
      fetchImpl,
    }),
    (error) =>
      error instanceof GitHubCatalogRequestError &&
      error.code === 'github_request_unreachable' &&
      !error.message.includes('socket unavailable')
  )
})

test('classifies request timeouts separately from other network failures', async () => {
  const fetchImpl = async () => {
    throw new DOMException('request timed out', 'TimeoutError')
  }

  await assert.rejects(
    githubJsonRequest('/repos/noblelar/fanal_owner/actions/runs', 'token', requestHeaders, {
      fetchImpl,
    }),
    (error) =>
      error instanceof GitHubCatalogRequestError && error.code === 'github_request_timeout'
  )
})
