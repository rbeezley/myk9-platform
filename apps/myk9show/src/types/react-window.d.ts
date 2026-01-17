declare module 'react-window' {
  import { ComponentType, CSSProperties, ReactNode, Ref } from 'react';

  export interface ListChildComponentProps<T = unknown> {
    index: number;
    style: CSSProperties;
    data: T;
    isScrolling?: boolean;
  }

  export interface ListOnItemsRenderedProps {
    overscanStartIndex: number;
    overscanStopIndex: number;
    visibleStartIndex: number;
    visibleStopIndex: number;
  }

  export interface ListOnScrollProps {
    scrollDirection: 'forward' | 'backward';
    scrollOffset: number;
    scrollUpdateWasRequested: boolean;
  }

  export interface FixedSizeListProps<T = unknown> {
    children: ComponentType<ListChildComponentProps<T>>;
    className?: string;
    direction?: 'ltr' | 'rtl';
    height: number | string;
    initialScrollOffset?: number;
    innerRef?: Ref<HTMLDivElement>;
    innerElementType?: string | ComponentType;
    itemCount: number;
    itemData?: T;
    itemKey?: (index: number, data: T) => string | number;
    itemSize: number;
    layout?: 'horizontal' | 'vertical';
    onItemsRendered?: (props: ListOnItemsRenderedProps) => void;
    onScroll?: (props: ListOnScrollProps) => void;
    outerRef?: Ref<HTMLDivElement>;
    outerElementType?: string | ComponentType;
    overscanCount?: number;
    style?: CSSProperties;
    useIsScrolling?: boolean;
    width: number | string;
  }

  export interface VariableSizeListProps<T = unknown> extends Omit<FixedSizeListProps<T>, 'itemSize'> {
    estimatedItemSize?: number;
    itemSize: (index: number) => number;
  }

  export class FixedSizeList<T = unknown> extends React.Component<FixedSizeListProps<T>> {
    scrollTo(scrollOffset: number): void;
    scrollToItem(index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start'): void;
  }

  export class VariableSizeList<T = unknown> extends React.Component<VariableSizeListProps<T>> {
    scrollTo(scrollOffset: number): void;
    scrollToItem(index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start'): void;
    resetAfterIndex(index: number, shouldForceUpdate?: boolean): void;
  }
}
