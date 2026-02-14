export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          bank_account: string | null
          bank_agency: string | null
          bank_name: string | null
          bank_pix_key: string | null
          city: string | null
          complement: string | null
          cpf_cnpj: string
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          email: string | null
          id: string
          name: string
          neighborhood: string | null
          number: string | null
          phone: string
          responsible_contact: string | null
          responsible_name: string | null
          state: string | null
          street: string | null
          trading_name: string | null
          updated_at: string
          validated: boolean
          validation_data: Json | null
          zip_code: string | null
        }
        Insert: {
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          bank_pix_key?: string | null
          city?: string | null
          complement?: string | null
          cpf_cnpj: string
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          id?: string
          name: string
          neighborhood?: string | null
          number?: string | null
          phone: string
          responsible_contact?: string | null
          responsible_name?: string | null
          state?: string | null
          street?: string | null
          trading_name?: string | null
          updated_at?: string
          validated?: boolean
          validation_data?: Json | null
          zip_code?: string | null
        }
        Update: {
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          bank_pix_key?: string | null
          city?: string | null
          complement?: string | null
          cpf_cnpj?: string
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          id?: string
          name?: string
          neighborhood?: string | null
          number?: string | null
          phone?: string
          responsible_contact?: string | null
          responsible_name?: string | null
          state?: string | null
          street?: string | null
          trading_name?: string | null
          updated_at?: string
          validated?: boolean
          validation_data?: Json | null
          zip_code?: string | null
        }
        Relationships: []
      }
      mcp_audit_logs: {
        Row: {
          actor: string
          created_at: string
          env: string
          error_message: string | null
          id: string
          ip: string | null
          ok: boolean
          request: Json | null
          response: Json | null
          tool: string
          trace_id: string | null
        }
        Insert: {
          actor?: string
          created_at?: string
          env?: string
          error_message?: string | null
          id?: string
          ip?: string | null
          ok?: boolean
          request?: Json | null
          response?: Json | null
          tool: string
          trace_id?: string | null
        }
        Update: {
          actor?: string
          created_at?: string
          env?: string
          error_message?: string | null
          id?: string
          ip?: string | null
          ok?: boolean
          request?: Json | null
          response?: Json | null
          tool?: string
          trace_id?: string | null
        }
        Relationships: []
      }
      operator_profiles: {
        Row: {
          city: string | null
          cnpj: string
          cnpj_validated: boolean
          cnpj_validation_data: Json | null
          company_email: string | null
          company_name: string
          company_phone: string | null
          complement: string | null
          cpf: string
          cpf_validated: boolean
          created_at: string
          full_name: string
          id: string
          neighborhood: string | null
          number: string | null
          phone: string
          state: string | null
          street: string | null
          trading_name: string | null
          updated_at: string
          user_id: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          cnpj: string
          cnpj_validated?: boolean
          cnpj_validation_data?: Json | null
          company_email?: string | null
          company_name: string
          company_phone?: string | null
          complement?: string | null
          cpf: string
          cpf_validated?: boolean
          created_at?: string
          full_name: string
          id?: string
          neighborhood?: string | null
          number?: string | null
          phone: string
          state?: string | null
          street?: string | null
          trading_name?: string | null
          updated_at?: string
          user_id: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          cnpj?: string
          cnpj_validated?: boolean
          cnpj_validation_data?: Json | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          complement?: string | null
          cpf?: string
          cpf_validated?: boolean
          created_at?: string
          full_name?: string
          id?: string
          neighborhood?: string | null
          number?: string | null
          phone?: string
          state?: string | null
          street?: string | null
          trading_name?: string | null
          updated_at?: string
          user_id?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      order_cancellation_logs: {
        Row: {
          cancelled_by: string
          cancelled_by_email: string
          created_at: string | null
          id: string
          order_id: string
          previous_delivery_status: string
          previous_payment_status: string
          reason: string | null
        }
        Insert: {
          cancelled_by: string
          cancelled_by_email: string
          created_at?: string | null
          id?: string
          order_id: string
          previous_delivery_status: string
          previous_payment_status: string
          reason?: string | null
        }
        Update: {
          cancelled_by?: string
          cancelled_by_email?: string
          created_at?: string | null
          id?: string
          order_id?: string
          previous_delivery_status?: string
          previous_payment_status?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_cancellation_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          customer_id: string
          delivery_date: string | null
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          delivery_time_slot: string | null
          id: string
          notes: string | null
          order_number: string
          payment_confirmed_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payment_url: string | null
          pix_copia_e_cola: string | null
          pix_transaction_id: string | null
          stripe_payment_intent_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id: string
          delivery_date?: string | null
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          delivery_time_slot?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_confirmed_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_url?: string | null
          pix_copia_e_cola?: string | null
          pix_transaction_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id?: string
          delivery_date?: string | null
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          delivery_time_slot?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_confirmed_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_url?: string | null
          pix_copia_e_cola?: string | null
          pix_transaction_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          images: string[] | null
          name: string
          price_kit: number
          price_single: number
          price_subscription: number
          stock: number
          stock_max: number
          stock_min: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          name: string
          price_kit?: number
          price_single?: number
          price_subscription?: number
          stock?: number
          stock_max?: number
          stock_min?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          name?: string
          price_kit?: number
          price_single?: number
          price_subscription?: number
          stock?: number
          stock_max?: number
          stock_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscription_deliveries: {
        Row: {
          created_at: string
          delivery_date: string
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          subscription_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          reserved_stock: number
          subscription_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          reserved_stock?: number
          subscription_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reserved_stock?: number
          subscription_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          customer_id: string
          delivery_time_slot: string
          delivery_weekday: Database["public"]["Enums"]["weekday"]
          delivery_weekdays: string[] | null
          frequency:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id: string
          is_emergency: boolean
          next_delivery_date: string | null
          notes: string | null
          payment_url: string | null
          pix_autorizacao_id: string | null
          pix_copia_e_cola: string | null
          pix_recorrencia_autorizada: boolean | null
          pix_recorrencia_data_inicio: string | null
          pix_recorrencia_status: string | null
          pix_recorrencia_valor_mensal: number | null
          pix_transaction_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_number: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          delivery_time_slot?: string
          delivery_weekday: Database["public"]["Enums"]["weekday"]
          delivery_weekdays?: string[] | null
          frequency?:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id?: string
          is_emergency?: boolean
          next_delivery_date?: string | null
          notes?: string | null
          payment_url?: string | null
          pix_autorizacao_id?: string | null
          pix_copia_e_cola?: string | null
          pix_recorrencia_autorizada?: boolean | null
          pix_recorrencia_data_inicio?: string | null
          pix_recorrencia_status?: string | null
          pix_recorrencia_valor_mensal?: number | null
          pix_transaction_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_number?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          delivery_time_slot?: string
          delivery_weekday?: Database["public"]["Enums"]["weekday"]
          delivery_weekdays?: string[] | null
          frequency?:
            | Database["public"]["Enums"]["subscription_frequency"]
            | null
          id?: string
          is_emergency?: boolean
          next_delivery_date?: string | null
          notes?: string | null
          payment_url?: string | null
          pix_autorizacao_id?: string | null
          pix_copia_e_cola?: string | null
          pix_recorrencia_autorizada?: boolean | null
          pix_recorrencia_data_inicio?: string | null
          pix_recorrencia_status?: string | null
          pix_recorrencia_valor_mensal?: number | null
          pix_transaction_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_number?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      customer_type: "PF" | "PJ"
      delivery_status: "aguardando" | "em_rota" | "entregue" | "cancelado"
      payment_method: "pix" | "cartao" | "boleto" | "stripe"
      payment_status: "pendente" | "confirmado" | "recusado" | "cancelado"
      subscription_frequency: "diaria" | "semanal" | "quinzenal" | "mensal"
      subscription_status: "ativa" | "pausada" | "cancelada"
      time_slot: "manha" | "tarde"
      weekday:
        | "domingo"
        | "segunda"
        | "terca"
        | "quarta"
        | "quinta"
        | "sexta"
        | "sabado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      customer_type: ["PF", "PJ"],
      delivery_status: ["aguardando", "em_rota", "entregue", "cancelado"],
      payment_method: ["pix", "cartao", "boleto", "stripe"],
      payment_status: ["pendente", "confirmado", "recusado", "cancelado"],
      subscription_frequency: ["diaria", "semanal", "quinzenal", "mensal"],
      subscription_status: ["ativa", "pausada", "cancelada"],
      time_slot: ["manha", "tarde"],
      weekday: [
        "domingo",
        "segunda",
        "terca",
        "quarta",
        "quinta",
        "sexta",
        "sabado",
      ],
    },
  },
} as const
