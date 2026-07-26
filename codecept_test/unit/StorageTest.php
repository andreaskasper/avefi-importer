<?php

class StorageTest extends \Codeception\Test\Unit
{
    protected $tester;

    public function testSanitizeStripsPathTraversal()
    {
        $this->assertSame("passwd", Storage::sanitizeFilename("../../etc/passwd"));
        $this->assertSame("evil.csv", Storage::sanitizeFilename("../evil.csv"));
        $this->assertSame("evil.csv", Storage::sanitizeFilename("C:\\Windows\\evil.csv"));
    }

    public function testSanitizeReplacesUnsafeChars()
    {
        $this->assertSame("foo_bar.csv", Storage::sanitizeFilename("foo bar.csv"));
        $this->assertStringNotContainsString("/", Storage::sanitizeFilename("a/b/c.json"));
    }

    public function testSanitizeNeverEmpty()
    {
        $this->assertNotSame("", Storage::sanitizeFilename("..."));
    }

    public function testPathHelpers()
    {
        putenv("FILES_PATH=/tmp/avefi-test");
        $this->assertSame("/tmp/avefi-test/ABC", Storage::importDir("ABC"));
        $this->assertSame("/tmp/avefi-test/ABC/org", Storage::orgDir("ABC"));
        $this->assertStringEndsWith("/ABC/avefi.v1.json", Storage::avefiPath("ABC"));
        putenv("FILES_PATH");
    }
}
