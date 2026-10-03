Shader "OliveTitan/Green Skin"
{
    Properties
    {
        _MainTex ("Skin base color", 2D) = "white" {}
        _SkinGain ("Linear skin color gain", Vector) = (1.32,2.35,1.16,1)
        _BumpMap ("Skin normal", 2D) = "bump" {}
        _BumpScale ("Normal strength", Range(0,2)) = 0.8
        _MetallicGlossMap ("Smoothness (A)", 2D) = "white" {}
        _GlossMapScale ("Smoothness scale", Range(0,1)) = 0.68
        _OcclusionMap ("Ambient occlusion", 2D) = "white" {}
        _OcclusionStrength ("Occlusion strength", Range(0,1)) = 0.8
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 300
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma target 3.0
        #include "UnityStandardUtils.cginc"
        sampler2D _MainTex, _BumpMap, _MetallicGlossMap, _OcclusionMap;
        half4 _SkinGain;
        half _BumpScale, _GlossMapScale, _OcclusionStrength;
        struct Input { float2 uv_MainTex; };
        void surf(Input input, inout SurfaceOutputStandard output)
        {
            // Grade the existing 4K skin only; the pants/hair/eyes use their own material.
            // Lighting still shades the surface naturally: no emission or green scene light.
            output.Albedo = saturate(tex2D(_MainTex, input.uv_MainTex).rgb * _SkinGain.rgb);
            output.Normal = UnpackScaleNormal(tex2D(_BumpMap, input.uv_MainTex), _BumpScale);
            output.Metallic = 0;
            output.Smoothness = tex2D(_MetallicGlossMap, input.uv_MainTex).a * _GlossMapScale;
            output.Occlusion = lerp(1, tex2D(_OcclusionMap, input.uv_MainTex).g, _OcclusionStrength);
            output.Alpha = 1;
        }
        ENDCG
    }
    FallBack "Standard"
}
