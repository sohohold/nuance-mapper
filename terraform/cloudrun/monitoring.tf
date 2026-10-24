# ── 監視 ──
# Cloud Runのメトリクスとstdoutのログはエージェントなしで自動収集される。
# ダッシュボード、GCP標準メトリクス、外形監視(月100万回まで)は無料。
# アラートポリシーの課金は2027年9月以降の予定で、外形監視メトリクスのアラートは対象外。

locals {
  run_filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.service_name}\""

  # ログベースメトリクスの名前の接頭辞。メトリクスタイプは logging.googleapis.com/user/<名前> になる。
  log_metric_prefix = replace(var.service_name, "-", "_")

  notification_channels = google_monitoring_notification_channel.email[*].id

  # 無料枠(月18万vCPU秒)の日割りを、課金対象インスタンス秒に換算した値。
  free_tier_instance_seconds_per_day = floor(180000 / 30 / tonumber(var.cpu))
}

resource "google_monitoring_notification_channel" "email" {
  count = var.alert_email == "" ? 0 : 1

  display_name = "${var.service_name} alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.enabled]
}

# ── ログベースメトリクス ──
# src/app/api/generate/route.ts が出力するログ行を数える。ログの文言を変えたらここも直すこと。

resource "google_logging_metric" "cache_hits" {
  name        = "${local.log_metric_prefix}/cache_hits"
  description = "キャッシュから返した生成リクエスト"
  filter      = "${local.run_filter} AND textPayload=~\"^Cache hit: \""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }

  depends_on = [google_project_service.enabled]
}

# "Winner: <provider>:<model> (N items)" の provider をラベルにする。
resource "google_logging_metric" "generations" {
  name        = "${local.log_metric_prefix}/generations"
  description = "LLMで生成して品質判定を通過したリクエスト（応答したプロバイダ別）"
  filter      = "${local.run_filter} AND textPayload=~\"^Winner: \""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    labels {
      key        = "provider"
      value_type = "STRING"
    }
  }

  label_extractors = {
    provider = "REGEXP_EXTRACT(textPayload, \"^Winner: ([^:]+):\")"
  }

  depends_on = [google_project_service.enabled]
}

# "Model failed: <provider>:<model>: <理由>" の provider をラベルにする。
resource "google_logging_metric" "model_failures" {
  name        = "${local.log_metric_prefix}/model_failures"
  description = "LLM呼び出しの失敗（プロバイダ別）。クォータ超過やタイムアウト、品質不足を含む"
  filter      = "${local.run_filter} AND textPayload=~\"^Model failed: \""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    labels {
      key        = "provider"
      value_type = "STRING"
    }
  }

  label_extractors = {
    provider = "REGEXP_EXTRACT(textPayload, \"^Model failed: ([^:]+):\")"
  }

  depends_on = [google_project_service.enabled]
}

resource "google_logging_metric" "generation_errors" {
  name        = "${local.log_metric_prefix}/generation_errors"
  description = "全プロバイダが失敗するなどして生成できなかったリクエスト"
  filter      = "${local.run_filter} AND textPayload=~\"^Error generating nuances\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }

  depends_on = [google_project_service.enabled]
}

# ── 外形監視 ──
# 最低3地域から実行される。スケールゼロ中はチェックのたびに起動が起こりうる。
resource "google_monitoring_uptime_check_config" "health" {
  display_name     = "${var.service_name} /api/health"
  timeout          = "30s"
  period           = var.uptime_check_period
  selected_regions = ["ASIA_PACIFIC", "USA_OREGON", "USA_VIRGINIA"]

  http_check {
    path           = "/api/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(google_cloud_run_v2_service.app.uri, "https://")
    }
  }

  content_matchers {
    content = "\"status\":\"ok\""
    matcher = "CONTAINS_STRING"
  }

  depends_on = [google_project_service.enabled]
}

# ── アラート ──

resource "google_monitoring_alert_policy" "uptime" {
  display_name          = "${var.service_name}: 外形監視の失敗"
  combiner              = "OR"
  notification_channels = local.notification_channels

  conditions {
    display_name = "/api/health が2地域以上で失敗"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "60s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Cloud Runサービス `${var.service_name}` の `/api/health` が応答していません。最新リビジョンの起動ログとコンテナ起動レイテンシを確認してください。"
  }
}

resource "google_monitoring_alert_policy" "server_errors" {
  display_name          = "${var.service_name}: 5xxレスポンスの増加"
  combiner              = "OR"
  notification_channels = local.notification_channels

  conditions {
    display_name = "5分間の5xxが${var.alert_5xx_threshold}件を超過"

    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\" AND ${local.run_filter}"
      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_5xx_threshold
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Cloud Runサービス `${var.service_name}` で5xxレスポンスが増えています。Cloud Loggingで `severity>=ERROR` のログを確認してください。"
  }
}

# ログ一致の条件はポイントを返さないため、アラート課金の対象にならない。
resource "google_monitoring_alert_policy" "generation_errors" {
  display_name          = "${var.service_name}: 生成の失敗"
  combiner              = "OR"
  notification_channels = local.notification_channels

  conditions {
    display_name = "Error generating nuances が出力された"

    condition_matched_log {
      filter = "${local.run_filter} AND textPayload=~\"^Error generating nuances\""
    }
  }

  alert_strategy {
    # 全プロバイダのクォータ切れが続く間に通知が連続しないよう、1時間に1通までにする。
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "全プロバイダの呼び出しが失敗しました。ダッシュボードの「失敗したプロバイダ」で、クォータ超過(429)かAPIキーの失効かを切り分けてください。"
  }

  depends_on = [google_project_service.enabled]
}

# ── ダッシュボード ──

locals {
  # 2列で並べるグラフの定義。aligner/reducerはデータセットごとに指定する。
  dashboard_charts = [
    {
      title  = "リクエスト数（レスポンスクラス別、5分ごと）"
      plot   = "STACKED_BAR"
      period = "300s"
      datasets = [{
        filter   = "metric.type=\"run.googleapis.com/request_count\" AND ${local.run_filter}"
        aligner  = "ALIGN_SUM"
        reducer  = "REDUCE_SUM"
        group_by = ["metric.label.response_code_class"]
        legend   = null
      }]
      thresholds = []
    },
    {
      title  = "レイテンシ（ミリ秒）"
      plot   = "LINE"
      period = "300s"
      datasets = [for p in ["50", "95", "99"] : {
        filter   = "metric.type=\"run.googleapis.com/request_latencies\" AND ${local.run_filter}"
        aligner  = "ALIGN_DELTA"
        reducer  = "REDUCE_PERCENTILE_${p}"
        group_by = []
        legend   = "p${p}"
      }]
      thresholds = []
    },
    {
      title  = "インスタンス数（状態別）"
      plot   = "STACKED_AREA"
      period = "60s"
      datasets = [{
        filter   = "metric.type=\"run.googleapis.com/container/instance_count\" AND ${local.run_filter}"
        aligner  = "ALIGN_MAX"
        reducer  = "REDUCE_SUM"
        group_by = ["metric.label.state"]
        legend   = null
      }]
      thresholds = []
    },
    {
      title  = "課金対象インスタンス時間（秒/日）"
      plot   = "STACKED_BAR"
      period = "86400s"
      datasets = [{
        filter   = "metric.type=\"run.googleapis.com/container/billable_instance_time\" AND ${local.run_filter}"
        aligner  = "ALIGN_SUM"
        reducer  = "REDUCE_SUM"
        group_by = []
        legend   = "課金対象"
      }]
      thresholds = [{
        value = local.free_tier_instance_seconds_per_day
        label = "無料枠の日割り"
      }]
    },
    {
      title  = "CPU使用率"
      plot   = "LINE"
      period = "300s"
      datasets = [for p in ["50", "95"] : {
        filter   = "metric.type=\"run.googleapis.com/container/cpu/utilizations\" AND ${local.run_filter}"
        aligner  = "ALIGN_DELTA"
        reducer  = "REDUCE_PERCENTILE_${p}"
        group_by = []
        legend   = "p${p}"
      }]
      thresholds = []
    },
    {
      title  = "メモリ使用率"
      plot   = "LINE"
      period = "300s"
      datasets = [for p in ["50", "95"] : {
        filter   = "metric.type=\"run.googleapis.com/container/memory/utilizations\" AND ${local.run_filter}"
        aligner  = "ALIGN_DELTA"
        reducer  = "REDUCE_PERCENTILE_${p}"
        group_by = []
        legend   = "p${p}"
      }]
      thresholds = []
    },
    {
      title  = "コンテナ起動レイテンシ（ミリ秒、コールドスタート）"
      plot   = "LINE"
      period = "3600s"
      datasets = [for p in ["50", "99"] : {
        filter   = "metric.type=\"run.googleapis.com/container/startup_latencies\" AND ${local.run_filter}"
        aligner  = "ALIGN_DELTA"
        reducer  = "REDUCE_PERCENTILE_${p}"
        group_by = []
        legend   = "p${p}"
      }]
      thresholds = []
    },
    {
      title  = "キャッシュヒットとLLM生成（1時間ごと）"
      plot   = "STACKED_BAR"
      period = "3600s"
      datasets = [
        {
          filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.cache_hits.name}\" AND resource.type=\"cloud_run_revision\""
          aligner  = "ALIGN_SUM"
          reducer  = "REDUCE_SUM"
          group_by = []
          legend   = "キャッシュヒット"
        },
        {
          filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.generations.name}\" AND resource.type=\"cloud_run_revision\""
          aligner  = "ALIGN_SUM"
          reducer  = "REDUCE_SUM"
          group_by = []
          legend   = "LLM生成"
        },
      ]
      thresholds = []
    },
    {
      title  = "応答したプロバイダ（1時間ごと）"
      plot   = "STACKED_BAR"
      period = "3600s"
      datasets = [{
        filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.generations.name}\" AND resource.type=\"cloud_run_revision\""
        aligner  = "ALIGN_SUM"
        reducer  = "REDUCE_SUM"
        group_by = ["metric.label.provider"]
        legend   = null
      }]
      thresholds = []
    },
    {
      title  = "失敗したプロバイダ（1時間ごと）"
      plot   = "STACKED_BAR"
      period = "3600s"
      datasets = [{
        filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.model_failures.name}\" AND resource.type=\"cloud_run_revision\""
        aligner  = "ALIGN_SUM"
        reducer  = "REDUCE_SUM"
        group_by = ["metric.label.provider"]
        legend   = null
      }]
      thresholds = []
    },
    {
      title  = "生成の失敗（1時間ごと）"
      plot   = "STACKED_BAR"
      period = "3600s"
      datasets = [{
        filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.generation_errors.name}\" AND resource.type=\"cloud_run_revision\""
        aligner  = "ALIGN_SUM"
        reducer  = "REDUCE_SUM"
        group_by = []
        legend   = "失敗"
      }]
      thresholds = []
    },
    {
      title  = "外形監視の成功率"
      plot   = "LINE"
      period = "1200s"
      datasets = [{
        filter   = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\""
        aligner  = "ALIGN_FRACTION_TRUE"
        reducer  = "REDUCE_MEAN"
        group_by = []
        legend   = "成功率"
      }]
      thresholds = []
    },
  ]

  dashboard_header_height = 4
  dashboard_chart_width   = 24
  dashboard_chart_height  = 16
}

resource "google_monitoring_dashboard" "main" {
  dashboard_json = jsonencode({
    displayName = "Nuance Mapper (${var.service_name})"
    mosaicLayout = {
      columns = 48
      tiles = concat(
        [{
          xPos   = 0
          yPos   = 0
          width  = 48
          height = local.dashboard_header_height
          widget = {
            title = "概要"
            text = {
              format  = "MARKDOWN"
              content = "Cloud Run `${var.service_name}`（${var.region}）。「課金対象インスタンス時間」の横線は、無料枠（月18万vCPU秒）を${var.cpu} vCPUで日割りした値です。プロバイダ別のグラフはアプリのログ行から集計しています。"
            }
          }
        }],
        [for i, c in local.dashboard_charts : {
          xPos   = (i % 2) * local.dashboard_chart_width
          yPos   = local.dashboard_header_height + floor(i / 2) * local.dashboard_chart_height
          width  = local.dashboard_chart_width
          height = local.dashboard_chart_height
          widget = {
            title = c.title
            xyChart = merge(
              {
                # 空の項目はキーごと省く。三項演算子だと真偽で型が揃わずエラーになるため for で絞る。
                dataSets = [for d in c.datasets : merge(
                  {
                    plotType           = c.plot
                    targetAxis         = "Y1"
                    minAlignmentPeriod = c.period
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = d.filter
                        aggregation = merge(
                          {
                            alignmentPeriod    = c.period
                            perSeriesAligner   = d.aligner
                            crossSeriesReducer = d.reducer
                          },
                          { for k, v in { groupByFields = d.group_by } : k => v if length(v) > 0 },
                        )
                      }
                    }
                  },
                  { for k, v in { legendTemplate = d.legend } : k => v if v != null },
                )]
                yAxis = { scale = "LINEAR" }
              },
              {
                for k, v in {
                  thresholds = [for t in c.thresholds : {
                    value      = t.value
                    label      = t.label
                    targetAxis = "Y1"
                  }]
                } : k => v if length(v) > 0
              },
            )
          }
        }],
      )
    }
  })

  depends_on = [google_project_service.enabled]
}

# ── 予算 ──
# 予算は通知するだけで課金を止めない。実質的な費用の上限は max_instances で設ける。

data "google_project" "current" {}

resource "google_billing_budget" "monthly" {
  count = var.billing_account_id == "" ? 0 : 1

  billing_account = var.billing_account_id
  display_name    = "${var.service_name} monthly"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  # 月末時点の予測が予算を超えた段階でも知らせる。
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = local.notification_channels
    disable_default_iam_recipients   = false
  }

  depends_on = [google_project_service.enabled]
}
