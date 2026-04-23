window.__extractLinkedInDescription = function () {
  var ESC    = String.fromCharCode(27)
  var RESET  = ESC + '[0m'
  var BOLD   = ESC + '[1m'
  var CYAN   = ESC + '[36m'
  var YELLOW = ESC + '[33m'
  var GREY   = ESC + '[90m'

  var convert = function (node) {
    if (node.nodeType === 3) return node.textContent || ''
    if (node.nodeType !== 1) return ''
    var tag = node.tagName.toLowerCase()
    if (['script', 'style', 'button', 'svg', 'img'].indexOf(tag) >= 0) return ''
    var inner = Array.from(node.childNodes).map(convert).join('')
    if (tag === 'h1') return '\n\n' + BOLD + CYAN + inner.trim() + RESET + '\n'
    if (tag === 'h2') return '\n\n' + BOLD + YELLOW + inner.trim() + RESET + '\n'
    if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return '\n\n' + BOLD + inner.trim() + RESET + '\n'
    if (tag === 'strong' || tag === 'b') return BOLD + inner + RESET
    if (tag === 'em' || tag === 'i') return GREY + inner + RESET
    if (tag === 'br') return '\n'
    if (tag === 'p') return inner.trim() ? inner.trim() + '\n' : ''
    if (tag === 'li') return '  ' + CYAN + '•' + RESET + ' ' + inner.trim() + '\n'
    if (tag === 'ul' || tag === 'ol') return '\n' + inner
    return inner
  }

  var box = document.querySelector('[data-testid="expandable-text-box"]')
  if (!box) return ''
  return convert(box).replace(/\n{3,}/g, '\n\n').trim()
}
