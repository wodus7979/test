Shader "SniperRidge/Foliage"
{
    Properties
    {
        _Color ("Leaf color", Color) = (0.3,0.5,0.2,1)
        _Glossiness ("Smoothness", Range(0,1)) = 0.2
        _Metallic ("Metallic", Range(0,1)) = 0
        _WindStrength ("Wind metres", Range(0,0.2)) = 0.045
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Cull Off
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows vertex:vert addshadow
        #pragma target 3.0
        #pragma multi_compile_instancing
        #include "UnityCG.cginc"
        fixed4 _Color;
        half _Glossiness, _Metallic, _WindStrength;
        struct Input { float3 worldPos; float facing : VFACE; };
        void vert(inout appdata_full v)
        {
            float3 w = mul(unity_ObjectToWorld, v.vertex).xyz;
            float phase = dot(w.xz, float2(0.71, 0.49));
            float bend = sin(_Time.y * 1.7 + phase) + 0.35 * sin(_Time.y * 3.1 + phase * 2.3);
            float3 offset = float3(bend, 0, bend * 0.35) * _WindStrength * saturate(v.vertex.y * 0.8);
            v.vertex.xyz += mul((float3x3)unity_WorldToObject, offset);
        }
        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            float variation = 0.94 + 0.06 * sin(dot(IN.worldPos, float3(2.3,0.8,1.7)));
            o.Albedo = _Color.rgb * variation;
            o.Normal = float3(0, 0, IN.facing >= 0 ? 1 : -1);
            o.Metallic = _Metallic;
            o.Smoothness = _Glossiness;
            o.Occlusion = 1;
            o.Alpha = 1;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
