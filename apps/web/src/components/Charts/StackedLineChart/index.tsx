import { QueryResult } from '@apollo/client'
import { ChartHeader } from 'components/Charts/ChartHeader'
import { Chart, ChartModel, ChartModelParams } from 'components/Charts/ChartModel'
import { StackedAreaSeriesOptions } from 'components/Charts/StackedLineChart/stacked-area-series/options'
import { StackedAreaSeries } from 'components/Charts/StackedLineChart/stacked-area-series/stacked-area-series'
import {
  Chain,
  Exact,
  HistoryDuration,
  PriceSource,
  TokenHistoricalTvlsQuery,
} from 'graphql/data/__generated__/types-and-hooks'
import { getProtocolColor } from 'graphql/data/util'
import {
  CustomStyleOptions,
  DeepPartial,
  ISeriesApi,
  LineStyle,
  Logical,
  UTCTimestamp,
  WhitespaceData,
} from 'lightweight-charts'
import { useMemo } from 'react'
import { useTheme } from 'styled-components'

export interface StackedLineData extends WhitespaceData<UTCTimestamp> {
  values: number[]
}

interface TVLChartParams extends ChartModelParams<StackedLineData> {
  colors: string[]
}

export class TVLChartModel extends ChartModel<StackedLineData> {
  protected series: ISeriesApi<'Custom'>

  private hoveredLogicalIndex: Logical | null | undefined

  constructor(chartDiv: HTMLDivElement, params: TVLChartParams) {
    super(chartDiv, params)

    this.series = this.api.addCustomSeries(new StackedAreaSeries(), {} as DeepPartial<CustomStyleOptions>)

    this.series.setData(this.data)
    this.updateOptions(params)
    this.fitContent()

    this.api.subscribeCrosshairMove((param) => {
      if (param?.logical !== this.hoveredLogicalIndex) {
        this.hoveredLogicalIndex = param?.logical
        this.series.applyOptions({
          hoveredLogicalIndex: this.hoveredLogicalIndex ?? (-1 as Logical), // -1 is used because series will use prev value if undefined is passed
        } as DeepPartial<StackedAreaSeriesOptions>)
      }
    })
  }

  updateOptions(params: TVLChartParams) {
    const isSingleLineChart = params.colors.length === 1

    const gridSettings = isSingleLineChart
      ? { grid: { vertLines: { style: LineStyle.CustomDotGrid }, horzLines: { style: LineStyle.CustomDotGrid } } }
      : {}

    super.updateOptions(params, {
      handleScale: false,
      handleScroll: false,
      rightPriceScale: {
        visible: isSingleLineChart, // Hide pricescale on multi-line charts
        borderVisible: false,
        scaleMargins: {
          top: 0.25,
          bottom: 0,
        },
        autoScale: true,
      },
      ...gridSettings,
    })
    const { data, colors } = params

    // Handles changes in data, e.g. time period selection
    if (this.data !== data) {
      this.data = data
      this.series.setData(data)
      this.fitContent()
    }

    this.series.applyOptions({
      priceLineVisible: false,
      lastValueVisible: false,
      colors,
      lineWidth: 2.5,
    } as DeepPartial<StackedAreaSeriesOptions>)
  }
}

interface LineChartProps {
  height: number
  sources?: PriceSource[]
  tvlsQueryResult: QueryResult<
    TokenHistoricalTvlsQuery,
    Exact<{
      chain: Chain
      address?: string
      duration: HistoryDuration
    }>
  >
}

export function LineChart({ height, tvlsQueryResult, sources }: LineChartProps) {
  const theme = useTheme()

  const { data: queryData } = tvlsQueryResult
  const tvls = queryData?.token?.market?.historicalTvl

  const data: StackedLineData[] = useMemo(() => {
    return (
      tvls?.map((point) => {
        return { values: [point.value], time: point.timestamp as UTCTimestamp }
      }) ?? []
    )
  }, [tvls])

  const params = useMemo(() => {
    const colors = sources?.map((source) => getProtocolColor(source, theme)) ?? [theme.accent1]
    return { data, colors }
  }, [data, theme, sources])

  const lastEntry = data[data.length - 1]

  // TODO(WEB-3430): Add error state for lack of data
  if (!lastEntry) return null

  return (
    <Chart Model={TVLChartModel} params={params} height={height}>
      {(crosshairData: StackedLineData | undefined) => (
        <ChartHeader
          value={(crosshairData ?? lastEntry)?.values.reduce((v, sum) => (sum += v), 0)}
          time={crosshairData?.time}
          protocolData={sources?.map((source, index) => ({ protocol: source, value: crosshairData?.values[index] }))}
        />
      )}
    </Chart>
  )
}