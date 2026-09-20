import { expect, test } from '@playwright/test'

const mockApiUrl = 'http://127.0.0.1:4174'

async function signIn(page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('owner@fanal.test')
  await page.getByLabel('Password').fill('owner-e2e-password')
  await page.getByRole('button', { name: 'Sign in to platform' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${mockApiUrl}/__test/reset`)
  expect(response.ok()).toBeTruthy()
})

test('shows the owner school analytics and refreshes the snapshot', async ({ page }) => {
  await signIn(page)
  await page.goto('/schools/school-e2e?section=overview')

  await expect(page.getByRole('heading', { name: 'School analytics' })).toBeVisible()
  await expect(page.getByTestId('analytics-total-staff')).toHaveText('7')
  await expect(page.getByTestId('analytics-enrolled-students')).toHaveText('214')
  await expect(page.getByTestId('analytics-total-parents')).toHaveText('176')
  await expect(page.getByTestId('analytics-pending-applications')).toHaveText('9')
  await expect(page.getByText('Akosua Mensah')).toBeVisible()
  await expect(page.getByText('General staff')).toBeVisible()

  await page.getByRole('button', { name: 'Refresh data' }).click()
  await expect(page.getByTestId('analytics-total-staff')).toHaveText('8')
})

test('keeps school governance available when analytics fail and supports retry', async ({ page, request }) => {
  await request.post(`${mockApiUrl}/__test/analytics-failure`, {
    data: { enabled: true },
  })
  await signIn(page)
  await page.goto('/schools/school-e2e?section=overview')

  await expect(page.getByRole('heading', { name: 'School figures could not be loaded' })).toBeVisible()
  await expect(page.getByText('School analytics are temporarily unavailable.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'School preview' })).toBeVisible()

  await request.post(`${mockApiUrl}/__test/analytics-failure`, {
    data: { enabled: false },
  })
  await page.getByRole('button', { name: 'Try again' }).click()

  await expect(page.getByRole('heading', { name: 'School analytics' })).toBeVisible()
  await expect(page.getByTestId('analytics-total-staff')).toHaveText('8')
})

test('renders zero-data analytics without horizontal overflow on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await page.goto('/schools/school-empty?section=overview')

  await expect(page.getByRole('heading', { name: 'School analytics' })).toBeVisible()
  await expect(page.getByTestId('analytics-total-staff')).toHaveText('0')
  await expect(page.getByText('No staff profiles recorded')).toBeVisible()
  await expect(page.getByText('No successful login recorded yet')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    )
    .toBe(true)
})
