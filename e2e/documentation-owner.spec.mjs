import { expect, test } from '@playwright/test'

const mockApiUrl = 'http://127.0.0.1:4174'

async function signIn(page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('owner@fanal.test')
  await page.getByLabel('Password').fill('owner-e2e-password')
  await page.getByRole('button', { name: 'Sign in to platform' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function openDocumentation(page, section) {
  await signIn(page)
  await page.goto(`/documentation?group=overview&section=${section}&flow=flow-1`)
  await expect(page.getByRole('heading', { name: 'Documentation' })).toBeVisible()
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${mockApiUrl}/__test/reset`)
  expect(response.ok()).toBeTruthy()
})

test('protects unsaved authoring, reports a failed save, and acknowledges a retry', async ({
  page,
}) => {
  await openDocumentation(page, 'details')

  const form = page.getByTestId('documentation-flow-details-form')
  const status = page.getByTestId('documentation-editor-status-flow-details:flow-1')
  await form.getByLabel('Title').fill('Trigger failed save')

  await expect(status).toHaveText('Unsaved changes')
  await expect(page.getByRole('button', { name: 'Publish draft' })).toBeDisabled()

  const detailsUrl = page.url()
  const dialogPromise = page.waitForEvent('dialog')
  const clickPromise = page.getByTestId('documentation-panel-steps').click()
  const dialog = await dialogPromise

  expect(dialog.message()).toContain('Discard the unsaved documentation changes')
  await dialog.dismiss()
  await clickPromise
  await expect(page).toHaveURL(detailsUrl)

  await form.getByRole('button', { name: 'Save details' }).click()
  await expect(status).toHaveText('Save failed')
  await expect(page.getByText('The simulated API save failed. Retry your changes.')).toBeVisible()

  await form.getByRole('button', { name: 'Save details' }).click()
  await expect(status).toHaveText('Saved')
  await expect(page.getByRole('button', { name: 'Publish draft' })).toBeEnabled()
})

test('adds, edits, atomically reorders, and removes a documentation step', async ({ page }) => {
  await openDocumentation(page, 'steps')

  await page.getByRole('button', { name: 'Add step' }).click()
  const newStep = page.getByTestId('documentation-step-step-3')
  await expect(newStep).toBeVisible()

  await newStep.getByLabel('Title').fill('Browser-tested third step')
  await newStep.getByLabel('Instruction').fill('Complete this step through the Owner UI.')
  await newStep.getByRole('button', { name: 'Save step' }).click()
  await expect(
    page.getByTestId('documentation-editor-status-flow-step:step-3')
  ).toHaveText('Saved')

  await newStep.getByRole('button', { name: 'Move up' }).click()
  await expect
    .poll(() =>
      page
        .locator('[data-testid^="documentation-step-"] input[name="stepId"]')
        .evaluateAll((inputs) => inputs.map((input) => input.value))
    )
    .toEqual(['step-1', 'step-3', 'step-2'])

  await page.getByTestId('documentation-step-step-3').getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('button', { name: 'Permanently remove step' }).click()
  await expect(page.getByTestId('documentation-step-step-3')).toHaveCount(0)
})

test('publishes a ready draft without requiring the live flow to be withdrawn', async ({ page }) => {
  await openDocumentation(page, 'overview')

  await page.getByRole('button', { name: 'Publish draft' }).click()
  await expect(page.getByText('Published revision is live')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create draft' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publish draft' })).toHaveCount(0)
})

test('uploads and attaches a cover image through the real Owner media flow', async ({ page }) => {
  await openDocumentation(page, 'media')

  await page
    .getByTestId('documentation-image-input-flow-media:flow-1')
    .setInputFiles({
      name: 'documentation-cover.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      ),
    })

  await expect(page.getByText('Uploaded image not saved')).toBeVisible()
  const mediaForm = page.getByTestId('documentation-flow-media-form')
  await mediaForm.getByRole('button', { name: 'Save media' }).click()
  await expect(page.getByText('Uploaded image not saved')).toHaveCount(0)
  await expect(page.getByTestId('documentation-editor-status-flow-media:flow-1')).toHaveText(
    'Saved'
  )
})

test('requires title confirmation before permanently deleting a draft flow', async ({ page }) => {
  await openDocumentation(page, 'overview')

  await page.getByRole('button', { name: 'New flow' }).click()
  await expect(page).toHaveURL(/flow=flow-2/)
  await expect(page).toHaveURL(/section=details/)

  await page.getByRole('button', { name: 'Delete flow' }).click()
  const confirmation = page.getByPlaceholder('Untitled documentation flow')
  const deleteButton = page.getByRole('button', { name: 'Permanently delete flow' })
  await expect(deleteButton).toBeDisabled()
  await confirmation.fill('Untitled documentation flow')
  await expect(deleteButton).toBeEnabled()
  await deleteButton.click()

  await expect(page).toHaveURL(/section=overview/)
  await expect(page).not.toHaveURL(/flow=flow-2/)
  await expect(page.getByText('Untitled documentation flow')).toHaveCount(0)
})
