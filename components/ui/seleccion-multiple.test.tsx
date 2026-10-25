import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SeleccionMultiple } from './seleccion-multiple'

const opciones = [
  { valor: 'a', rotulo: 'Alfa' },
  { valor: 'b', rotulo: 'Beta' },
  { valor: 'c', rotulo: 'Gamma' },
]

function Controlado({ inicial, onCambio, ...resto }: { inicial: string[]; onCambio?: (v: string[]) => void } & Partial<React.ComponentProps<typeof SeleccionMultiple>>) {
  const [valor, setValor] = useState(inicial)
  return (
    <SeleccionMultiple
      legend="Marcas"
      opciones={opciones}
      valor={valor}
      onCambio={(v) => {
        setValor(v)
        onCambio?.(v)
      }}
      {...resto}
    />
  )
}

describe('SeleccionMultiple · estructura y accesibilidad', () => {
  it('es un fieldset con leyenda visible y contador "n de total"', () => {
    render(<Controlado inicial={['a', 'b']} />)
    expect(screen.getByRole('group', { name: /Marcas/ })).toBeInTheDocument()
    expect(screen.getByText(/2 de 3/)).toBeInTheDocument()
  })

  it('un checkbox nativo por opción, más "Todas" al principio', () => {
    render(<Controlado inicial={['a']} />)
    const cajas = screen.getAllByRole('checkbox')
    expect(cajas).toHaveLength(4)
    expect(cajas[0]).toHaveAccessibleName('Todas')
    expect(screen.getByLabelText('Alfa')).toBeChecked()
    expect(screen.getByLabelText('Beta')).not.toBeChecked()
  })

  it('sin "Todas" cuando se pide (todas={false})', () => {
    render(<Controlado inicial={['a']} todas={false} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.queryByLabelText('Todas')).toBeNull()
  })

  it('"Todas" está marcada con todas, desmarcada con ninguna de más y mixta con algunas', () => {
    const { rerender } = render(<SeleccionMultiple legend="M" opciones={opciones} valor={['a', 'b', 'c']} onCambio={() => {}} />)
    const todas = () => screen.getByLabelText('Todas') as HTMLInputElement
    expect(todas().checked).toBe(true)
    expect(todas().indeterminate).toBe(false)
    expect(todas()).toHaveAttribute('aria-checked', 'true')
    rerender(<SeleccionMultiple legend="M" opciones={opciones} valor={['a', 'b']} onCambio={() => {}} />)
    expect(todas().checked).toBe(false)
    expect(todas().indeterminate).toBe(true)
    expect(todas()).toHaveAttribute('aria-checked', 'mixed')
  })
})

describe('SeleccionMultiple · modo controlado', () => {
  it('marcar y desmarcar avisa con la lista en el orden de las opciones', () => {
    const onCambio = vi.fn()
    render(<Controlado inicial={['c']} onCambio={onCambio} />)
    fireEvent.click(screen.getByLabelText('Alfa'))
    expect(onCambio).toHaveBeenLastCalledWith(['a', 'c'])
    fireEvent.click(screen.getByLabelText('Gamma'))
    expect(onCambio).toHaveBeenLastCalledWith(['a'])
  })

  it('"Todas" selecciona todas; con todas marcadas vuelve al valor por defecto (la primera), nunca vacío', () => {
    const onCambio = vi.fn()
    render(<Controlado inicial={['b']} onCambio={onCambio} />)
    fireEvent.click(screen.getByLabelText('Todas'))
    expect(onCambio).toHaveBeenLastCalledWith(['a', 'b', 'c'])
    fireEvent.click(screen.getByLabelText('Todas'))
    expect(onCambio).toHaveBeenLastCalledWith(['a'])
  })

  it('no se puede dejar sin ninguna: la última no se desmarca (aria-disabled, no disabled) y se explica', () => {
    const onCambio = vi.fn()
    render(<Controlado inicial={['b']} onCambio={onCambio} />)
    const beta = screen.getByLabelText('Beta')
    expect(beta).toHaveAttribute('aria-disabled', 'true')
    expect(beta).not.toBeDisabled()
    fireEvent.click(beta)
    expect(onCambio).not.toHaveBeenCalled()
    expect(beta).toBeChecked()
    expect(screen.getByText('Tiene que quedar al menos una')).toBeInTheDocument()
    expect(beta).toHaveAccessibleDescription('Tiene que quedar al menos una')
  })

  it('con 2 marcadas no hay bloqueo ni mensaje', () => {
    render(<Controlado inicial={['a', 'b']} />)
    expect(screen.getByLabelText('Alfa')).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('Tiene que quedar al menos una')).toBeNull()
  })

  it('respeta un mínimo distinto', () => {
    const onCambio = vi.fn()
    render(<Controlado inicial={['a', 'b']} minimo={2} onCambio={onCambio} />)
    fireEvent.click(screen.getByLabelText('Alfa'))
    expect(onCambio).not.toHaveBeenCalled()
  })

  it('en modo controlado no pone name: no viaja en ningún formulario', () => {
    render(<Controlado inicial={['a']} />)
    for (const c of screen.getAllByRole('checkbox')) expect(c).not.toHaveAttribute('name')
  })
})

describe('SeleccionMultiple · arranque vacío', () => {
  it('sin nada marcado no bloquea ni avisa; recién al marcar una queda protegida', () => {
    render(<Controlado inicial={[]} />)
    expect(screen.queryByText('Tiene que quedar al menos una')).toBeNull()
    fireEvent.click(screen.getByLabelText('Beta'))
    expect(screen.getByText('Tiene que quedar al menos una')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Beta'))
    expect(screen.getByLabelText('Beta')).toBeChecked()
  })
})

describe('SeleccionMultiple · modo URL (form GET)', () => {
  const enForm = (props: Partial<React.ComponentProps<typeof SeleccionMultiple>> = {}) => {
    const alEnviar = vi.fn((e: Event) => e.preventDefault())
    const r = render(
      <form onSubmit={(e) => alEnviar(e.nativeEvent)} data-testid="form">
        <SeleccionMultiple legend="Marcas" opciones={opciones} valor={['a', 'c']} name="marca" {...props} />
        <button type="submit">Aplicar</button>
      </form>,
    )
    return { ...r, alEnviar }
  }

  it('cada opción lleva name y value; "Todas" no viaja', () => {
    enForm()
    expect(screen.getByLabelText('Alfa')).toHaveAttribute('name', 'marca')
    expect(screen.getByLabelText('Alfa')).toHaveAttribute('value', 'a')
    expect(screen.getByLabelText('Todas')).not.toHaveAttribute('name')
  })

  it('el formulario serializa solo las marcadas, repetidas', () => {
    enForm()
    const datos = new FormData(screen.getByTestId('form') as HTMLFormElement)
    expect(datos.getAll('marca')).toEqual(['a', 'c'])
  })

  it('cambiar una opción actualiza el estado interno sin onCambio', () => {
    enForm()
    fireEvent.click(screen.getByLabelText('Beta'))
    expect(screen.getByLabelText('Beta')).toBeChecked()
    expect(new FormData(screen.getByTestId('form') as HTMLFormElement).getAll('marca')).toEqual(['a', 'b', 'c'])
  })

  it('con autoEnviar, cada cambio envía el formulario ya con el estado nuevo', () => {
    const { alEnviar } = enForm({ autoEnviar: true })
    fireEvent.click(screen.getByLabelText('Beta'))
    expect(alEnviar).toHaveBeenCalledTimes(1)
  })

  it('con autoEnviar, "Todas" también envía y llega con todas marcadas', () => {
    const vistos: string[][] = []
    render(
      <form
        data-testid="f2"
        onSubmit={(e) => {
          e.preventDefault()
          vistos.push(new FormData(e.currentTarget).getAll('marca') as string[])
        }}
      >
        <SeleccionMultiple legend="Marcas" opciones={opciones} valor={['a']} name="marca" autoEnviar />
      </form>,
    )
    fireEvent.click(screen.getAllByLabelText('Todas').at(-1)!)
    expect(vistos).toEqual([['a', 'b', 'c']])
  })

  it('sin autoEnviar no envía solo', () => {
    const { alEnviar } = enForm()
    fireEvent.click(screen.getByLabelText('Beta'))
    expect(alEnviar).not.toHaveBeenCalled()
  })

  it('si el valor de afuera cambia (navegó a otra URL), se actualiza', () => {
    const { rerender } = render(<SeleccionMultiple legend="M" opciones={opciones} valor={['a']} name="marca" />)
    expect(screen.getByLabelText('Alfa')).toBeChecked()
    rerender(<SeleccionMultiple legend="M" opciones={opciones} valor={['b', 'c']} name="marca" />)
    expect(screen.getByLabelText('Alfa')).not.toBeChecked()
    expect(screen.getByLabelText('Gamma')).toBeChecked()
  })

  it('con el mínimo no se desmarca la última ni se envía', () => {
    const { alEnviar } = enForm({ valor: ['a'], autoEnviar: true })
    fireEvent.click(screen.getByLabelText('Alfa'))
    expect(screen.getByLabelText('Alfa')).toBeChecked()
    expect(alEnviar).not.toHaveBeenCalled()
  })
})
