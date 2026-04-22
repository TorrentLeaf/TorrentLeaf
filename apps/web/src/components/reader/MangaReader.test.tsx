import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { MangaReader } from './MangaReader'

const backMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: backMock, push: vi.fn(), replace: vi.fn() }),
}))

let mock: MockAdapter

function renderReader(sessionId: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return render(<MangaReader sessionId={sessionId} />, { wrapper: Wrapper })
}

function seedPages(sessionId: string, count: number) {
  const pages = Array.from({ length: count }, (_, i) => ({
    index: i,
    fileId: `f-${i}`,
    name: `page-${i + 1}.jpg`,
    mimeType: 'image/jpeg',
    length: 1000,
  }))
  mock.onGet(new RegExp(`/reader/${sessionId}/pages$`)).reply(200, pages)
}

function stubProgress() {
  mock.onGet(/\/progress\//).reply(404, {})
  mock.onPut(/\/progress\//).reply(200, {})
}

beforeEach(() => {
  mock = new MockAdapter(api)
  backMock.mockReset()
  // jsdom doesn't implement IntersectionObserver
  class IO {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() { return [] }
  }
  // @ts-expect-error test stub
  globalThis.IntersectionObserver = IO
})

afterEach(() => {
  mock.restore()
})

describe('<MangaReader>', () => {
  it('renders the first page and page counter on load', async () => {
    seedPages('sess-1', 3)
    stubProgress()
    renderReader('sess-1')

    await waitFor(() =>
      expect(screen.getByText('1 / 3')).toBeInTheDocument(),
    )
    expect(screen.getByText('page-1.jpg')).toBeInTheDocument()
  })

  it('advances to the next page on ArrowRight', async () => {
    seedPages('sess-2', 4)
    stubProgress()
    renderReader('sess-2')
    await waitFor(() => expect(screen.getByText('1 / 4')).toBeInTheDocument())

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
  })

  it('stays on the last page when pressing Next past the end', async () => {
    seedPages('sess-end', 2)
    stubProgress()
    renderReader('sess-end')
    await waitFor(() => expect(screen.getByText('1 / 2')).toBeInTheDocument())

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('goes back one page on ArrowLeft and never below 1', async () => {
    seedPages('sess-back', 3)
    stubProgress()
    renderReader('sess-back')
    await waitFor(() => expect(screen.getByText('1 / 3')).toBeInTheDocument())

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      fireEvent.keyDown(window, { key: 'ArrowLeft' })
      fireEvent.keyDown(window, { key: 'ArrowLeft' })
    })
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('cycles reading mode with M', async () => {
    seedPages('sess-mode', 1)
    stubProgress()
    renderReader('sess-mode')
    await waitFor(() => expect(screen.getByText(/Paginated/)).toBeInTheDocument())

    await act(async () => {
      fireEvent.keyDown(window, { key: 'M' })
    })
    expect(screen.getByText(/Webtoon/)).toBeInTheDocument()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'M' })
    })
    expect(screen.getByText(/Double page/)).toBeInTheDocument()
  })

  it('Escape calls router.back', async () => {
    seedPages('sess-esc', 1)
    stubProgress()
    renderReader('sess-esc')
    await waitFor(() => expect(screen.getByText('1 / 1')).toBeInTheDocument())

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(backMock).toHaveBeenCalled()
  })

  it('shows the empty state when there are no readable pages', async () => {
    mock.onGet(/\/reader\/sess-empty\/pages$/).reply(200, [])
    stubProgress()
    renderReader('sess-empty')
    await waitFor(() =>
      expect(screen.getByText(/No readable pages/i)).toBeInTheDocument(),
    )
  })

  it('jumping via the slider updates the counter', async () => {
    seedPages('sess-slide', 10)
    stubProgress()
    renderReader('sess-slide')
    await waitFor(() => expect(screen.getByText('1 / 10')).toBeInTheDocument())

    const slider = screen.getByLabelText('Page') as HTMLInputElement
    await act(async () => {
      fireEvent.change(slider, { target: { value: '5' } })
    })
    expect(screen.getByText('6 / 10')).toBeInTheDocument()
  })

  it('clicking the Back button in the header calls router.back', async () => {
    seedPages('sess-btn', 1)
    stubProgress()
    renderReader('sess-btn')
    await waitFor(() => expect(screen.getByText('1 / 1')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(backMock).toHaveBeenCalled()
  })
})
