import { lazy } from 'react';

export const GlobeView = lazy(() => import('@/components/GlobeView').then(m => ({ default: m.GlobeView })));
export const NodeList = lazy(() => import('@/components/NodeList').then(m => ({ default: m.NodeList })));
export const UptimeView = lazy(() => import('@/components/UptimeView').then(m => ({ default: m.UptimeView })));
export const NodeCharts = lazy(() => import('@/components/NodeCharts').then(m => ({ default: m.NodeCharts })));
export const NodeNetwork = lazy(() => import('@/components/NodeNetwork').then(m => ({ default: m.NodeNetwork })));
export const ChartModal = lazy(() => import('@/components/ChartModal').then(m => ({ default: m.ChartModal })));
