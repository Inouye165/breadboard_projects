class ResizeObserverMock {
	observe() {}

	unobserve() {}

	disconnect() {}
}

if (typeof window !== 'undefined') {
	Object.defineProperty(window, 'ResizeObserver', {
		writable: true,
		configurable: true,
		value: ResizeObserverMock,
	})
}