import { useEffect, useRef } from 'react'

// El límite procede del código, nunca del atributo editable en el inspector.
export default function FixedLengthInput({ maxLength, ...props }) {
  const inputRef = useRef(null)

  useEffect(() => {
    const input = inputRef.current
    const restoreLimit = () => {
      if (input.getAttribute('maxlength') !== String(maxLength)) {
        input.setAttribute('maxlength', String(maxLength))
      }
    }
    restoreLimit()
    const observer = new MutationObserver(restoreLimit)
    observer.observe(input, { attributes: true, attributeFilter: ['maxlength'] })
    return () => observer.disconnect()
  }, [maxLength])

  return <input {...props} ref={inputRef} maxLength={maxLength} />
}
