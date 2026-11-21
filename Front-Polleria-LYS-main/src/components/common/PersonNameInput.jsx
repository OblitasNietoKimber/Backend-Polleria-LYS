import FixedLengthInput from './FixedLengthInput'

const hasNumbers = value => /\p{N}/u.test(value)
const withoutNumbers = value => value.replace(/\p{N}/gu, '')

export default function PersonNameInput({ value = '', onChange, ...props }) {
  function update(event, nextValue) {
    event.target.value = nextValue.slice(0, Math.min(props.maxLength ?? 120, 120))
    onChange?.(event)
  }

  function handlePaste(event) {
    const text = event.clipboardData?.getData('text') || ''
    if (!hasNumbers(text)) return
    event.preventDefault()
    const input = event.currentTarget
    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? value.length
    const nextValue = value.slice(0, start) + withoutNumbers(text) + value.slice(end)
    update(event, nextValue.slice(0, props.maxLength ?? 120))
  }

  return (
    <FixedLengthInput
      {...props}
      maxLength={Math.min(props.maxLength ?? 120, 120)}
      value={value}
      onKeyDown={event => {
        if (!event.ctrlKey && !event.metaKey && !event.altKey && /^\p{N}$/u.test(event.key)) event.preventDefault()
      }}
      onPaste={handlePaste}
      onChange={event => update(event, withoutNumbers(event.target.value))}
    />
  )
}
