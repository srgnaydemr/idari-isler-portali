import type { CSSProperties } from "react";
import { getThemeSettings } from "@/lib/local/database";

export const DEFAULT_THEME: Record<string,string> = {
  theme_font_family:"Urbanist, sans-serif", theme_base_font_size:"14", theme_menu_font_size:"14", theme_table_font_size:"14", theme_page_title_size:"27", theme_heading_weight:"800", theme_button_height:"40", theme_input_height:"42", theme_table_row_padding:"12", theme_card_gap:"13",
  theme_primary:"#17324d", theme_primary_hover:"#244d73", theme_background:"#f5f7fa", theme_surface:"#ffffff",
  theme_sidebar:"#102a43", theme_sidebar_text:"#dce7f0", theme_active_menu:"#244d73", theme_header:"#ffffff",
  theme_border:"#e3e8ef", theme_text:"#172033", theme_muted:"#667085", theme_success:"#16824b", theme_warning:"#b96200",
  theme_danger:"#c73636", theme_card_radius:"14", theme_button_radius:"10", theme_input_radius:"10", theme_card_padding:"18",
  theme_shadow:"0 8px 26px rgba(16,42,67,.07)", theme_table_zebra:"0"
};
export function mergedTheme(){ return {...DEFAULT_THEME,...getThemeSettings()}; }
export function themeCssVars(): CSSProperties {
  const t=mergedTheme();
  return {
    ["--font-family" as any]: t.theme_font_family,
    ["--font-size" as any]: `${Number(t.theme_base_font_size)||14}px`,
    ["--menu-font-size" as any]: `${Number(t.theme_menu_font_size)||14}px`,
    ["--table-font-size" as any]: `${Number(t.theme_table_font_size)||14}px`,
    ["--page-title-size" as any]: `${Number(t.theme_page_title_size)||27}px`, ["--heading-weight" as any]: String(Number(t.theme_heading_weight)||800),
    ["--button-height" as any]: `${Number(t.theme_button_height)||40}px`, ["--input-height" as any]: `${Number(t.theme_input_height)||42}px`,
    ["--table-row-padding" as any]: `${Number(t.theme_table_row_padding)||12}px`, ["--card-gap" as any]: `${Number(t.theme_card_gap)||13}px`,
    ["--navy" as any]: t.theme_primary,["--navy-2" as any]:t.theme_primary_hover,["--bg" as any]:t.theme_background,["--surface" as any]:t.theme_surface,
    ["--sidebar" as any]:t.theme_sidebar,["--sidebar-text" as any]:t.theme_sidebar_text,["--active-menu" as any]:t.theme_active_menu,["--header" as any]:t.theme_header,
    ["--line" as any]:t.theme_border,["--text" as any]:t.theme_text,["--muted" as any]:t.theme_muted,["--green" as any]:t.theme_success,["--orange" as any]:t.theme_warning,["--red" as any]:t.theme_danger,
    ["--radius-card" as any]:`${Number(t.theme_card_radius)||14}px`,["--radius-button" as any]:`${Number(t.theme_button_radius)||10}px`,["--radius-input" as any]:`${Number(t.theme_input_radius)||10}px`,
    ["--card-padding" as any]:`${Number(t.theme_card_padding)||18}px`,["--shadow" as any]:t.theme_shadow,
  } as CSSProperties;
}
