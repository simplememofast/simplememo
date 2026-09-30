# G03 HTMLの有限代表例

TYPE1 before

<pre>TYPE1 raw *literal*</pre>

TYPE1 after

TYPE2 before

<!-- TYPE2 hidden -->

TYPE2 after

TYPE3 before

<?author TYPE3?>

TYPE3 after

TYPE4 before

<!AUTHOR TYPE4>

TYPE4 after

TYPE5 before

<![CDATA[TYPE5 literal]]>

TYPE5 after

TYPE6 before

<div>TYPE6 block</div>

TYPE6 after

TYPE7 before

<author-element>TYPE7 complete custom tag</author-element>

TYPE7 after

INLINE before <!-- inline hidden --> after

INLINE PI <?author inline?> end

INLINE DECL <!AUTHOR inline> end

INLINE CDATA <![CDATA[inline literal]]> end
