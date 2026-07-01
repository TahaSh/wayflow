import css from './styles.css?raw'

export const injectStyles = () => {
  if (document.querySelector('[data-wf-styles]')) return

  const style = document.createElement('style')
  style.setAttribute('data-wf-styles', '')
  style.textContent = css
  document.head.appendChild(style)
}
