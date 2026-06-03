import { useAdvanceDays } from './useAdvanceDays'
import { useAdvanceDaysStore } from './useAdvanceDaysStore'

const { initCalendarAdvanceBalance, changeYearAdvanceBalance } = useAdvanceDays()
const { balances } = useAdvanceDaysStore()

// 1. Инициализация
initCalendarAdvanceBalance({
    year: 2026,
    prevYears: 5,
    advanceDays: 10
})

console.log('Initial calendar:')
console.table(balances[2026].calendar.map(m => ({
    title: m.title,
    vested: m.vested,
    vestedSpent: m.vestedSpent,
    reserveSpent: m.reserveSpent,
    advanceSpent: m.advanceSpent,
    overLimit: m.overLimit
})))


// 2. "Клики" по календарю
function click(month: number, action:  'set' | 'unset') {
    console.log(`\n▶ CLICK: month ${month}, action=${action}`)
    changeYearAdvanceBalance(2026, month, action)

    console.table(balances[2026].calendar.map(m => ({
        title: m.title,
        vested: m.vested,
        vestedSpent: m.vestedSpent,
        reserveSpent: m.reserveSpent,
        advanceSpent: m.advanceSpent,
        overLimit: m.overLimit
    })))
}

// Примеры:
click(0, 'set')
click(0, 'set')
click(5, 'set')
click(0, 'unset')
click(11, 'set')
