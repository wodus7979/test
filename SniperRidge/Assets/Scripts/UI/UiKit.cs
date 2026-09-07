using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace SniperRidge
{
    /// <summary>uGUI 요소를 코드로 만드는 작은 헬퍼.</summary>
    public static class UiKit
    {
        public static void Place(RectTransform rt, Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.pivot = pivot;
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
        }

        public static RectTransform Panel(Transform parent, string name, Color color,
                                          Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = color;
            img.raycastTarget = false;
            var rt = go.GetComponent<RectTransform>();
            Place(rt, anchorMin, anchorMax, pivot, pos, size);
            return rt;
        }

        public static RectTransform Fullscreen(Transform parent, string name, Color color)
        {
            return Panel(parent, name, color, Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
        }

        public static Text Label(Transform parent, string name, string text, int fontSize, TextAnchor align, Color color,
                                 Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size, bool bold = false)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text), typeof(Shadow));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.font = ProceduralAssets.UiFont;
            t.text = text;
            t.fontSize = fontSize;
            t.alignment = align;
            t.color = color;
            t.fontStyle = bold ? FontStyle.Bold : FontStyle.Normal;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            var sh = go.GetComponent<Shadow>();
            sh.effectColor = new Color(0f, 0f, 0f, 0.8f);
            sh.effectDistance = new Vector2(1.5f, -1.5f);
            Place(go.GetComponent<RectTransform>(), anchor, anchor, pivot, pos, size);
            return t;
        }

        public static Button TextButton(Transform parent, string name, string label, int fontSize, Color bg, Color fg,
                                        Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size, UnityAction onClick)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = bg;
            var btn = go.GetComponent<Button>();
            var colors = btn.colors;
            colors.highlightedColor = new Color(1f, 1f, 1f, 0.9f);
            colors.pressedColor = new Color(0.7f, 0.7f, 0.7f, 0.9f);
            btn.colors = colors;
            if (onClick != null) btn.onClick.AddListener(onClick);
            Place(go.GetComponent<RectTransform>(), anchor, anchor, pivot, pos, size);
            Label(go.transform, "Label", label, fontSize, TextAnchor.MiddleCenter, fg,
                  new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, size);
            return btn;
        }
    }
}
