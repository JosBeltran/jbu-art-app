'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { Button, Modal, Pagination, Search, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@carbon/react'
import { ChevronDown, ChevronRight, Filter, Renew, Settings } from '@carbon/icons-react'
import styles from './AdminDataGrid.module.css'

export default function AdminDataGrid({
  t, label, rows, columns, getId, layout, setLayout, resetLayout, query, changeQuery,
  search, setSearch, searchFields, filters, total, loading, error, refresh,
  selection, setSelection, rowActions, bulkActions, views, viewActions, onView, emptyState, loadingState,
  scrollKey, scrollPositionRef, pageSizes, layoutDisabled,
}) {
  const [panel, setPanel] = useState('')
  const [collapsed, setCollapsed] = useState(new Set())
  const scroll = useRef(null)
  const headerCheckbox = useRef(null)
  const didRestoreScroll = useRef(false)
  const ids = rows.map(getId)
  const canSelect = Boolean(selection && setSelection)
  const allSelected = canSelect && ids.length > 0 && ids.every(id => selection.has(id))
  const someSelected = canSelect && ids.some(id => selection.has(id))
  const visible = layout.columns.map(id => columns.find(column => column.id === id)).filter(Boolean)
  const activeFilters = filters.flatMap(filter => (query.filters[filter.id] || []).map(value => ({ filter, value })))
  const groupColumn = columns.find(column => column.id === query.group)
  const groups = new Map()
  for (const row of rows) {
    const key = groupColumn ? groupColumn.value(row) ?? '' : ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = someSelected && !allSelected
  }, [allSelected, someSelected])

  useEffect(() => {
    if (!loading && !error && !didRestoreScroll.current && scroll.current && scrollPositionRef?.current) {
      const position = scrollPositionRef.current
      scroll.current.scrollTop = position.top
      scroll.current.scrollLeft = position.left
      didRestoreScroll.current = true
    }
  }, [loading, error, scrollPositionRef])

  function toggleSelection(rowIds, checked) {
    const next = new Set(selection)
    for (const id of rowIds) {
      if (checked) next.add(id)
      else next.delete(id)
    }
    setSelection(next)
  }

  function toggleFilter(id, value, checked) {
    const next = new Set(query.filters[id] || [])
    if (checked) next.add(value)
    else next.delete(value)
    changeQuery({ filters: { ...query.filters, [id]: [...next] }, page: 1 })
  }

  function moveColumn(id, offset) {
    const next = [...layout.columns]
    const position = next.indexOf(id)
    const target = position + offset
    if (target < 0 || target >= next.length) return
    const [column] = next.splice(position, 1)
    next.splice(target, 0, column)
    setLayout({ ...layout, columns: next })
  }

  const actionLabel = t('Acciones', 'Actions')
  const span = visible.length + Number(canSelect) + Number(Boolean(rowActions))
  return (
    <section className={styles.grid} aria-label={label}>
      <div className={styles.toolbar}>
        <label className={styles.select}>{t('Vista', 'View')}
          <select aria-label={t('Vista', 'View')} value={query.view} onChange={event => onView(event.target.value)}>
            {views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select>
        </label>
        <div className={styles.search} title={searchFields.join(', ')}>
          <Search size="sm" labelText={t('Buscar', 'Search')} placeholder={t('Buscar en el inventario', 'Search inventory')}
            value={search} maxLength={200} onChange={event => setSearch(event.target.value)}
            closeButtonLabelText={t('Limpiar búsqueda', 'Clear search')} />
        </div>
        <Button size="sm" kind="ghost" renderIcon={Filter} onClick={() => setPanel('filters')}>
          {t('Filtros', 'Filters')}{activeFilters.length ? ' (' + activeFilters.length + ')' : ''}
        </Button>
        <label className={styles.select}>{t('Agrupar por', 'Group by')}
          <select aria-label={t('Agrupar por', 'Group by')} value={query.group} onChange={event => {
            setCollapsed(new Set())
            changeQuery({ group: event.target.value })
          }}>
            <option value="">{t('Sin agrupar', 'None')}</option>
            {columns.filter(column => column.groupable).map(column => <option key={column.id} value={column.id}>{column.label}</option>)}
          </select>
        </label>
        <Button size="sm" kind="ghost" renderIcon={Settings} disabled={layoutDisabled} onClick={() => setPanel('columns')}>{t('Columnas', 'Columns')}</Button>
        <label className={styles.select}>{t('Densidad', 'Density')}
          <select aria-label={t('Densidad', 'Density')} disabled={layoutDisabled} value={layout.density} onChange={event => setLayout({ ...layout, density: event.target.value })}>
            <option value="comfortable">{t('Cómoda', 'Comfortable')}</option>
            <option value="compact">{t('Compacta', 'Compact')}</option>
          </select>
        </label>
        <Button size="sm" kind="ghost" renderIcon={Renew} onClick={refresh}>{t('Actualizar', 'Refresh')}</Button>
        <Button size="sm" kind="ghost" onClick={() => setPanel('views')}>{t('Gestionar vistas', 'Manage views')}</Button>
      </div>

      {activeFilters.length > 0 && <div className={styles.chips}>
        {activeFilters.map(({ filter, value }) => <button type="button" key={filter.id + ':' + value}
          aria-label={t('Quitar filtro', 'Remove filter') + ' ' + filter.label + ' ' + filter.display(value)}
          onClick={() => toggleFilter(filter.id, value, false)}>{filter.label} · {filter.display(value)} ×</button>)}
        <Button size="sm" kind="ghost" onClick={() => changeQuery({ filters: {}, page: 1 })}>{t('Limpiar todos los filtros', 'Clear all filters')}</Button>
      </div>}
      {canSelect && selection.size > 0 && <div className={styles.batch} aria-label={t('Acciones en lote', 'Batch actions')}>
        <strong>{selection.size} {t('seleccionadas en esta página', 'selected on this page')}</strong>
        {bulkActions?.([...selection])}
        <Button size="sm" kind="ghost" onClick={() => setSelection(new Set())}>{t('Limpiar selección', 'Clear selection')}</Button>
      </div>}
      {groupColumn && <p className={styles.scope}>{t('Los grupos y sus totales corresponden a esta página.', 'Groups and counts cover this page.')}</p>}
      <div ref={scroll} className={styles.scroll} role="region" aria-label={label} tabIndex={0}
        onScroll={event => {
          if (!scrollKey || loading || error) return
          const { scrollTop, scrollLeft } = event.currentTarget
          try { sessionStorage.setItem(scrollKey, JSON.stringify({ top: scrollTop, left: scrollLeft })) } catch {}
        }}>
        <Table aria-label={label} aria-busy={loading} size={layout.density === 'compact' ? 'sm' : 'md'}
          className={layout.density === 'compact' ? styles.compact : styles.comfortable}>
          <TableHead>
            <TableRow>
              {canSelect && <TableHeader scope="col" className={styles.checkbox}>
                <input ref={headerCheckbox} type="checkbox" checked={allSelected} disabled={!rows.length || loading || !!error}
                  aria-label={t('Seleccionar filas de esta página', 'Select rows on this page')}
                  onChange={event => toggleSelection(ids, event.target.checked)} />
              </TableHeader>}
              {visible.map(column => <TableHeader scope="col" key={column.id} className={column.numeric ? styles.numeric : undefined}
                aria-sort={query.sort === column.id ? (query.descending ? 'descending' : 'ascending') : undefined}>
                {column.sortable ? <button type="button" className={styles.sort}
                  onClick={() => changeQuery({ sort: column.id, descending: query.sort === column.id ? !query.descending : false, page: 1 })}>
                  {column.label}{query.sort === column.id && <span aria-hidden> {query.descending ? '↓' : '↑'}</span>}
                </button> : column.label}
              </TableHeader>)}
              {rowActions && <TableHeader scope="col">{actionLabel}</TableHeader>}
            </TableRow>
          </TableHead>
          <TableBody>
            {(loading || error || !rows.length) && <TableRow><TableCell colSpan={span} className={styles.message}>
              {error ? <span role="alert">{error}</span> : <span role="status">{loading ? loadingState ?? t('Cargando registros…', 'Loading records…') : emptyState ?? t('No hay registros que coincidan.', 'No matching records.')}</span>}
            </TableCell></TableRow>}
            {!loading && !error && [...groups].map(([key, members]) => {
              const groupKey = query.group + ':' + key
              const expanded = !groupColumn || !collapsed.has(groupKey)
              return <Fragment key={groupKey}>
                {groupColumn && <TableRow className={styles.group}>
                  <TableCell colSpan={span}>
                    <button type="button" aria-expanded={expanded} onClick={() => {
                      const next = new Set(collapsed)
                      if (expanded) next.add(groupKey)
                      else next.delete(groupKey)
                      setCollapsed(next)
                    }}>
                      {expanded ? <ChevronDown /> : <ChevronRight />}
                      {(key && groupColumn.groupLabel?.(key)) || key || t('Sin valor', 'Unspecified')} ({members.length})
                    </button>
                  </TableCell>
                </TableRow>}
                {expanded && members.map(row => {
                  const id = getId(row)
                  return <TableRow key={id} className={selection?.has(id) ? styles.selected : undefined}>
                    {canSelect && <TableCell className={styles.checkbox}><input type="checkbox" checked={selection.has(id)}
                      aria-label={t('Seleccionar', 'Select') + ' ' + (rowActions?.label(row) || id)}
                      onChange={event => toggleSelection([id], event.target.checked)} /></TableCell>}
                    {visible.map(column => <TableCell key={column.id} className={column.numeric ? styles.numeric : undefined}>
                      {column.render ? column.render(row) : column.value(row) ?? '—'}
                    </TableCell>)}
                    {rowActions && <TableCell>{rowActions.render(row)}</TableCell>}
                  </TableRow>
                })}
              </Fragment>
            })}
          </TableBody>
        </Table>
      </div>
      <Pagination page={query.page} pageSize={query.size} pageSizes={pageSizes} totalItems={total}
        disabled={loading || !!error} onChange={({ page, pageSize }) => {
          if (page !== query.page || pageSize !== query.size) changeQuery({ page: pageSize === query.size ? page : 1, size: pageSize })
        }}
        backwardText={t('Página anterior', 'Previous page')} forwardText={t('Página siguiente', 'Next page')}
        itemsPerPageText={t('Registros por página', 'Records per page')} pageNumberText={t('Página', 'Page')} />
      {panel && <Modal open passiveModal size="sm" onRequestClose={() => setPanel('')}
        modalHeading={panel === 'filters' ? t('Filtros', 'Filters') : panel === 'columns' ? t('Configurar columnas', 'Configure columns') : t('Gestionar vistas', 'Manage views')}>
        {panel === 'filters' && <div className={styles.panel}>
          {filters.map(filter => <fieldset key={filter.id}>
            <legend>{filter.label}</legend>
            <div className={styles.options}>
              {[...new Set([...filter.options, ...(query.filters[filter.id] || [])])].map(value => <label key={value}>
                <input type="checkbox" checked={(query.filters[filter.id] || []).includes(value)}
                  onChange={event => toggleFilter(filter.id, value, event.target.checked)} /> {filter.display(value)}
              </label>)}
            </div>
          </fieldset>)}
          <Button size="sm" kind="ghost" onClick={() => changeQuery({ filters: {}, page: 1 })}>{t('Limpiar todos los filtros', 'Clear all filters')}</Button>
        </div>}
        {panel === 'columns' && <div className={styles.panel}>
          {[...visible, ...columns.filter(column => !layout.columns.includes(column.id))].map(column => {
            const position = layout.columns.indexOf(column.id)
            return <div key={column.id} className={styles.columnOption}>
              <label><input type="checkbox" checked={position >= 0} disabled={column.required}
                onChange={event => setLayout({ ...layout, columns: event.target.checked ? [...layout.columns, column.id] : layout.columns.filter(id => id !== column.id) })} /> {column.label}</label>
              {position >= 0 && <span>
                <Button kind="ghost" size="sm" disabled={position === 0} onClick={() => moveColumn(column.id, -1)}
                  aria-label={t('Subir', 'Move up') + ' ' + column.label}>↑</Button>
                <Button kind="ghost" size="sm" disabled={position === layout.columns.length - 1} onClick={() => moveColumn(column.id, 1)}
                  aria-label={t('Bajar', 'Move down') + ' ' + column.label}>↓</Button>
              </span>}
            </div>
          })}
          <Button size="sm" kind="ghost" onClick={resetLayout}>{t('Restaurar columnas', 'Restore default columns')}</Button>
        </div>}
        {panel === 'views' && viewActions}
      </Modal>}
    </section>
  )
}
