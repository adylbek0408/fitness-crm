import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    if (typeof window !== 'undefined' && window.console) {
      console.error('ErrorBoundary caught:', error, info)
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen flex items-center justify-center px-4"
          style={{ background: '#faf7f8' }}
        >
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={26} className="text-rose-500" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 mb-2">Что-то пошло не так</h1>
            <p className="text-sm text-gray-500 mb-5">
              Страница неожиданно завершилась. Попробуйте обновить — если ошибка повторится,
              напишите администратору.
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-semibold shadow-md hover:shadow-lg transition focus:outline-none focus:ring-2 focus:ring-rose-300"
            >
              <RefreshCw size={15} aria-hidden="true" /> Обновить страницу
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
