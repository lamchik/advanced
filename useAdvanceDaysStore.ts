import { reactive, type Reactive } from 'vue'
import { createGlobalState } from '@vueuse/core'

export type Month = {
  value: string
  title: string
  vested: number /* Кол-во дней, завестившихся с учётом трат "обычных дней" в прошлые месяцы (остаток текущего года к текущему месяцу), тратятся первыми */
  vestedSpent: number /* Кол-во дней из копилки текущего года, которые выбраны в текущем месяце  */
  reserveSpent: number /* Кол-во дней, которые потрачены в текущем месяце из остатка прошлых лет (тратятся вторыми) */
  advanceSpent: number /* Кол-во дней, которые потрачены в текущем месяце из авансовых дней (тратятся последними) */
  overLimit: number /* Кол-во дней в текущем месяце, которые "накликаны" после того, как не осталось vested, advance и reserve (все "копилки" опустели, фиксируем превышение лимита в текущем месяце) */
  next: Month | null
  prev: Month | null
}

type Balance = {
  advance: number /* Остаток авансовых дней, доступный для использования сейчас */
  reserve: number /* Остаток прошлых дней, доступный для использования сейчас */
  calendar: Month[]
}

type BalancesPerYear = Record<number, Balance>

export  type AdvanceDaysStore = {
  balances: Reactive<BalancesPerYear>
}

export const useAdvanceDaysStore = createGlobalState((): AdvanceDaysStore => {
  const balances = reactive({})

  return {
    balances
  }
})
