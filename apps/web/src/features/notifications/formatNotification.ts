/** Подчищает старые уведомления из БД (смешанный EN/RU) для отображения. */
export function formatNotificationContent(content: string, type: string): string {
  let text = content.trim()
  if (!text) return text

  if (type === 'moderation_status') {
    text = text.replace(
      /Модерация события «([^»]+)»:\s*approved\.\s*Причина:\s*[—\-–]/gi,
      'Событие «$1» прошло модерацию и опубликовано в каталоге.'
    )
    text = text.replace(
      /Модерация события «([^»]+)»:\s*approved\.?/gi,
      'Событие «$1» прошло модерацию и опубликовано в каталоге.'
    )
    text = text.replace(
      /Модерация события «([^»]+)»:\s*rejected\.\s*Причина:\s*(.+)/gi,
      'Событие «$1» не прошло модерацию. Причина: $2'
    )
    text = text.replace(/\s*Причина:\s*[—\-–]\s*$/i, '')
  }

  if (type.startsWith('complaint_')) {
    text = text.replace(
      /Жалоба по событию «([^»]+)» обработана:\s*resolved/gi,
      'Ваша жалоба на событие «$1» рассмотрена. Спасибо, что помогаете поддерживать качество афиши.'
    )
    text = text.replace(
      /Жалоба по событию «([^»]+)» обработана:\s*rejected/gi,
      'Жалоба на событие «$1» закрыта: по итогам проверки меры не потребовались.'
    )
  }

  return text
}
