import css from './styles.css?raw'

export const injectUIStyles = () => {
  if (document.querySelector('[data-wf-ui-styles]')) return

  const style = document.createElement('style')
  style.setAttribute('data-wf-ui-styles', '')
  style.textContent = css
  document.head.appendChild(style)
}
