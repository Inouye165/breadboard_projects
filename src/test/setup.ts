class ResizeObserverMock {
	observe() {}

	unobserve() {}

	disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
	writable: true,
	configurable: true,
	value: ResizeObserverMock,
})