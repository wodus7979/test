// 화면 후처리: 블룸 + ACES 톤매핑 + 노출/채도/대비 + 비네트 (내장 렌더 파이프라인용)
Shader "Hidden/SniperRidge/Post"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
    }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always

        // Pass 0: 밝은 부분 추출 (다운샘플 대상)
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float _Threshold;
            fixed4 frag(v2f_img i) : SV_Target
            {
                fixed4 c = tex2D(_MainTex, i.uv);
                float l = max(c.r, max(c.g, c.b));
                float k = max(0.0, l - _Threshold);
                return c * (k / max(l, 1e-4));
            }
            ENDCG
        }

        // Pass 1: 가우시안 블러 (방향은 _BlurDir)
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float4 _BlurDir;
            fixed4 frag(v2f_img i) : SV_Target
            {
                float w0 = 0.227, w1 = 0.194, w2 = 0.121, w3 = 0.054, w4 = 0.016;
                fixed4 s = tex2D(_MainTex, i.uv) * w0;
                s += (tex2D(_MainTex, i.uv + _BlurDir.xy * 1.0) + tex2D(_MainTex, i.uv - _BlurDir.xy * 1.0)) * w1;
                s += (tex2D(_MainTex, i.uv + _BlurDir.xy * 2.0) + tex2D(_MainTex, i.uv - _BlurDir.xy * 2.0)) * w2;
                s += (tex2D(_MainTex, i.uv + _BlurDir.xy * 3.0) + tex2D(_MainTex, i.uv - _BlurDir.xy * 3.0)) * w3;
                s += (tex2D(_MainTex, i.uv + _BlurDir.xy * 4.0) + tex2D(_MainTex, i.uv - _BlurDir.xy * 4.0)) * w4;
                return s;
            }
            ENDCG
        }

        // Pass 2: 합성
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            sampler2D _Bloom;
            float _Exposure, _BloomIntensity, _Saturation, _Contrast, _Vignette;

            float3 aces(float3 x)
            {
                const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
                return saturate((x * (a * x + b)) / (x * (c * x + d) + e));
            }

            fixed4 frag(v2f_img i) : SV_Target
            {
                float3 c = tex2D(_MainTex, i.uv).rgb;
                c += tex2D(_Bloom, i.uv).rgb * _BloomIntensity;
                c *= _Exposure;
                c = aces(c);
                float lum = dot(c, float3(0.2126, 0.7152, 0.0722));
                c = lerp(lum.xxx, c, _Saturation);
                c = (c - 0.5) * _Contrast + 0.5;
                float2 d = i.uv - 0.5;
                c *= 1.0 - _Vignette * dot(d, d) * 2.5;
                return fixed4(saturate(c), 1.0);
            }
            ENDCG
        }
    }
    Fallback Off
}
