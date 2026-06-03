import { computed, type ComputedRef } from 'vue'
import useAdvanceDaysModule from './useAdvanceDaysStore';
import {Month} from "./useAdvanceDaysStore";
const { useAdvanceDaysStore } = useAdvanceDaysModule;

const MONTHS = [ 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
type SelectedDay = {
  monthIndex: number
}
type Action = 'set' | 'unset'
type Direction = 'prev' | 'next'
type BalanceSource = 'advance' | 'reserve'
const sourceToSpentField: Record<BalanceSource, keyof Pick<Month, 'advanceSpent' | 'reserveSpent'>> = {
  advance: 'advanceSpent',
  reserve: 'reserveSpent'
}

export type UseAdvanceDays = {
  overLimits: ComputedRef<Month[]>
  /* @TODO: Должен принимать "мапы" и работать с ними */
  prepareSelectedDaysFromCalendar: () => SelectedDay[]
  initCalendarAdvanceBalance: (props: {
    /* @TODO: Убрать это в InitCalendarAdvanceBalanceConfig */
    year: number
    prevYears: number
    advanceDays: number
  }) => void
  applyCurrentCalendarToAdvanceBalance: (year: number, selectedDays: SelectedDay[]) => void
  changeYearAdvanceBalance: (year: number, monthIndex: number, action: Action) => void
}

const { balances } = useAdvanceDaysStore()

/* Логика обхода calendar в рамках конкретного balance для понимания, в каких месяцах и на сколько мы превысили лимиты */
const overLimits = computed(() => {
  /* @TODO currentYear должен браться из существующего store для работы с отпусками */
  const currentYear = 2026
  return balances[currentYear].calendar.filter((month) => month.overLimit > 0)
})

/* Функция, которая из соответствующих мап достаёт дни и преобразует их к нужному формату */
const prepareSelectedDaysFromCalendar = (): SelectedDay[] => {
  return []
}

const initCalendarAdvanceBalance = ({
  year,
  prevYears,
  advanceDays
}: {
  /* @TODO: Убрать это в InitCalendarAdvanceBalanceConfig */
  year: number
  prevYears: number
  advanceDays: number
}): void => {
  const _initMonth = (month: { value: string; title: string }, index: number): Month => ({
    value: month.value,
    title: month.title,
    vested: _maxVestedForMonth(index),
    vestedSpent: 0,
    reserveSpent: 0,
    advanceSpent: 0,
    overLimit: 0,
    next: null,
    prev: null
  })

  const _linkMonths = (months: Month[]): Month[] => {
    return months.map((month, index) => {
      month.prev = index > 0 ? months[index - 1] : null
      month.next = index < months.length - 1 ? months[index + 1] : null
      return month
    })
  }

  if (balances[year]) {
    return
  }

  /* @TODO: Вынеси в отдельную функцию в store для обновления balances */
  balances[year] = {
    reserve: prevYears,
    advance: advanceDays,
    calendar: _linkMonths(MONTHS.map((month, index) => _initMonth(month, index)))
  }
}

/**
 * Максимальное кол-во vested-дней, доступных к месяцу index
 * Для месяцев 0–10: округляем в меньшую сторону, чтобы работать с целыми числами
 * Для декабря (11) в большую: ceil(vestedByMonthStep * 12), чтобы все дни года были доступны
 */
const _maxVestedForMonth = (index: number): number => {
  if (index === 11) {
    return Math.ceil(vestedByMonthStep * 12)
  }

  return Math.floor(vestedByMonthStep * (index + 1))
}

/*
 * Пересчёт vested у всех месяцев календаря по формуле min-over-suffix:
 * vested[i] = max(0, min(maxVested(k) - cumSpent(k) для k от i до 11))
 *
 * Суть: для каждого месяца i берём минимальный «запас» (slack) по всем месяцам от i до декабря.
 * Это гарантирует, что если в будущем месяце уже потрачено много vested-дней,
 * это ограничит доступные vested-дни в текущем и предыдущих месяцах.
 * vested[i] ограничен не только тем, сколько дней «завестилось» к месяцу i, но и тем, сколько свободных дней осталось с учётом трат во всех будущих месяцах.
 */
const _recalcAllVested = (calendar: Month[]): void => {
  // 1. Строим массив кумулятивных трат: cumSpent[i] = sum(vestedSpent[0..i])
  const cumSpent: number[] = []
  let sum = 0

  for (let i = 0; i < calendar.length; i++) {
    sum += calendar[i].vestedSpent
    cumSpent.push(sum)
  }

  // 2. Для каждого месяца вычисляем min(maxVested(k) - cumSpent[k]) по k от i до 11
  calendar.forEach((month, i) => {
    let minSlack = Infinity

    for (let k = i; k < calendar.length; k++) {
      minSlack = Math.min(minSlack, _maxVestedForMonth(k) - cumSpent[k])
    }

    month.vested = Math.max(0, minSlack)
  })
}

/*
 * Рекурсивный поиск месяца с overLimit в заданном направлении.
 * При нахождении: overLimit--, source-копилка--, sourceSpent++.
 * Используется при unset advance/reserve дня - высвободившийся день из копилки может «покрыть» overLimit в другом месяце.
 */
const _swapOverLimit = (month: Month, balance: Balance, direction: Direction, source: BalanceSource): boolean => {
  if (month.overLimit > 0) {
    month.overLimit--
    balance[source]--
    month[sourceToSpentField[source]]++

    return true
  }

  const sibling = month[direction]

  return sibling ? _swapOverLimit(sibling, balance, direction, source) : false
}

/**
 * Swap-логика при высвобождении vested-дня.
 * После _recalcAllVested у некоторых месяцев vested мог увеличиться.
 * Если в каком-то месяце одновременно vested > 0 и есть overLimit/advanceSpent/reserveSpent, заменяем «дорогой» день на vested.
 *
 * Приоритет: overLimit => advanceSpent => reserveSpent.
 * Поиск: сначала в текущем месяце, потом prev, потом next.
 * Максимум 1 swap за один unset (т.к. totalVestedSpent уменьшился на 1).
 */
const _swapToVested = (balance: Balance, calendar: Month[]): boolean => {
  /* Ищем месяц-кандидат для swap по всему календарю */
  for (const month of calendar) {
    if (month.vested <= 0) {
      continue
    }

    if (month.overLimit > 0) {
      month.overLimit--
      month.vestedSpent++
      _recalcAllVested(calendar)

      return true
    }

    if (month.advanceSpent > 0) {
      month.advanceSpent--
      balance.advance++
      month.vestedSpent++
      _recalcAllVested(calendar)

      return true
    }

    if (month.reserveSpent > 0) {
      month.reserveSpent--
      balance.reserve++
      month.vestedSpent++
      _recalcAllVested(calendar)

      return true
    }
  }

  return false
}

const changeYearAdvanceBalance = (year: number, monthIndex: number, action: Action): void => {
  const balance = balances[year]

  if (!balance) {
    return
  }

  const month = balance.calendar[monthIndex]

  if (!month) {
    return
  }

  /* Нажатие на календаре на день */
  if (action === 'set') {
    if (month.vested > 0) {
      month.vestedSpent++
      _recalcAllVested(balance.calendar)

      return
    }

    if (balance.reserve > 0) {
      balance.reserve--
      month.reserveSpent++

      return
    }

    if (balance.advance > 0) {
      balance.advance--
      month.advanceSpent++

      return
    }

    /* Если все "копилки" опустошились, считаем, что в этом месяце превышены все лимиты на +1 день */
    month.overLimit++

    return
  }

  /* Отжатие на календаре дня */
  if (action === 'unset') {
    /* Первым делом, важно смотреть на превышение лимита в текущем месяце, в таком случае других месяцев это не касается */
    if (month.overLimit > 0) {
      month.overLimit--

      return
    }

    /* Восполняем "копилки", дни из которых были потрачены.
       При пополнении копилки проверяем, можно ли swap'нуть overLimit в другом месяце. */
    if (month.advanceSpent > 0) {
      month.advanceSpent--
      balance.advance++

      /* Пробуем swap: высвободившийся advance-день может покрыть overLimit в другом месяце */
      if (month.prev) {
        const swappedInPrev = _swapOverLimit(month.prev, balance, 'prev', 'advance')

        if (swappedInPrev) {
          return
        }
      }

      if (month.next) {
        _swapOverLimit(month.next, balance, 'next', 'advance')
      }

      return
    }

    if (month.reserveSpent > 0) {
      month.reserveSpent--
      balance.reserve++

      /* Пробуем swap: высвободившийся reserve-день может покрыть overLimit в другом месяце */
      if (month.prev) {
        const swappedInPrev = _swapOverLimit(month.prev, balance, 'prev', 'reserve')

        if (swappedInPrev) {
          return
        }
      }

      if (month.next) {
        _swapOverLimit(month.next, balance, 'next', 'reserve')
      }

      return
    }

    if (month.vestedSpent > 0) {
      month.vestedSpent--
      _recalcAllVested(balance.calendar)

      /* Высвободившийся vested-день может заменить overLimit/advance/reserve в другом месяце */
      _swapToVested(balance, balance.calendar)

      return
    }
  }
}

/* Применение текущих выбранных дней из разных "мап" для баланса авансирования
*  @TODO: Добавить функцию для получения selectedDays из наших "мап" - prepareSelectedDaysFromCalendar (выше)
*  */
const applyCurrentCalendarToAdvanceBalance = (year: number, selectedDays: SelectedDay[]): void => {
  const balance = balances[year]

  if (!balance) {
    return
  }

  /* Сортируем дни по возрастанию месяца. Важно, т.к. логика зависит от хронологии. */
  const sortedDays = [ ...selectedDays ].sort((a, b) => a.monthIndex - b.monthIndex)

  /* Последовательно применяем "клики" */
  for (const day of sortedDays) {
    changeYearAdvanceBalance(currentYear, day.monthIndex, 'set')
  }
}

console.log('overLimits', overLimits)
export const useAdvanceDays = (): UseAdvanceDays => {
  return {
    overLimits,
    prepareSelectedDaysFromCalendar,
    initCalendarAdvanceBalance,
    applyCurrentCalendarToAdvanceBalance,
    changeYearAdvanceBalance
  }
}
