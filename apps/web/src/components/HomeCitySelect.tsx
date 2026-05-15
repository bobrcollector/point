import { CitySelect } from './CitySelect'

/** Компактный выбор города на мобильной ленте (на десктопе — в сайдбаре). */
export function HomeCitySelect() {
  return <CitySelect variant="light" className="homeCityDropdown" showLabel />
}
