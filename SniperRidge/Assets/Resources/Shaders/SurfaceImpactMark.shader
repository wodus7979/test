Shader "SniperRidge/SurfaceImpactMark"
{
    Properties { _MainTex ("Impact",2D)="white" {} }
    SubShader
    {
        Tags { "Queue"="Transparent-10" "RenderType"="Transparent" "IgnoreProjector"="True" }
        ZWrite Off ZTest LEqual Cull Off Offset -1,-1
        Blend SrcAlpha OneMinusSrcAlpha
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #include "UnityCG.cginc"
            struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;};
            struct v2f {float4 position:SV_POSITION;float2 uv:TEXCOORD0;UNITY_FOG_COORDS(1)};
            sampler2D _MainTex;
            v2f vert(appdata v){v2f o;o.position=UnityObjectToClipPos(v.vertex);o.uv=v.uv;UNITY_TRANSFER_FOG(o,o.position);return o;}
            fixed4 frag(v2f i):SV_Target {fixed4 c=tex2D(_MainTex,i.uv);UNITY_APPLY_FOG(i.fogCoord,c);return c;}
            ENDCG
        }
    }
}
