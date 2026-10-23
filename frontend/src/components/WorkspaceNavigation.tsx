import { NavigationItem, NavigationRail } from '@pockethive/ui'
import { NavLink, useLocation } from 'react-router-dom'

const destinations = [
  { path: '/', label: 'Home', symbol: '⌂' },
  { path: '/suts', label: 'SUTs', symbol: '▣' },
  { path: '/datasets', label: 'DataSets', symbol: '▤' },
  { path: '/inventory', label: 'CSV inventory', symbol: '▦' },
  { path: '/population', label: 'Population', symbol: '▷' },
]

export function WorkspaceNavigation({ expanded, onExpandedChange, locked }: { expanded: boolean; onExpandedChange: (expanded: boolean) => void; locked: boolean }) {
  const { search } = useLocation()
  return <NavigationRail expanded={expanded} onExpandedChange={onExpandedChange} label="Workspace" expandLabel="Expand view sidebar" collapseLabel="Collapse view sidebar">
    {destinations.map(item => <NavigationItem key={item.path} label={item.label} expanded={expanded} icon={<span className="pd-nav-icon" aria-hidden="true">{item.symbol}</span>}>
      {presentation => <NavLink {...presentation} to={`${item.path}${search}`} end={item.path === '/'} aria-disabled={locked || undefined} onClick={event => { if (locked) event.preventDefault() }} />}
    </NavigationItem>)}
  </NavigationRail>
}
